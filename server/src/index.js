const express = require('express');
const cors = require('cors');
const { simpleGit } = require('simple-git');
const os = require('os');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { buildDependencyGraph, analyzeDependencyGraph } = require('@cockpit/core');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const MAX_UPLOAD_SIZE = process.env.MAX_UPLOAD_SIZE ? parseInt(process.env.MAX_UPLOAD_SIZE, 10) : 50 * 1024 * 1024; // 50MB limit
const MAX_FILE_COUNT = process.env.MAX_FILE_COUNT ? parseInt(process.env.MAX_FILE_COUNT, 10) : 5000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE
  }
});

// GitHub URL validation regex
// Accepts: https://github.com/owner/repo or https://github.com/owner/repo.git
const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?\/?$/;

function validateGitHubUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'repoUrl is required and must be a string' };
  }

  const trimmed = rawUrl.trim();
  const match = trimmed.match(GITHUB_REPO_REGEX);

  if (!match) {
    return {
      valid: false,
      error: 'Invalid GitHub URL. Must be in the format: https://github.com/owner/repo'
    };
  }

  const owner = match[1];
  const repo = match[2];

  // Prevent dotfiles or option-like names
  if (owner.startsWith('-') || owner.startsWith('.') || repo.startsWith('-') || repo.startsWith('.')) {
    return { valid: false, error: 'Invalid repository or owner name in GitHub URL' };
  }

  return { valid: true, cleanUrl: `https://github.com/${owner}/${repo}.git` };
}

async function cloneRepository(repoUrl, targetDir, timeoutMs = 60000) {
  const git = simpleGit();
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const err = new Error(`Clone timed out after ${timeoutMs / 1000} seconds`);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });

  try {
    await Promise.race([
      git.clone(repoUrl, targetDir, ['--depth', '1', '--no-tags', '--single-branch']),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Executes the core graph analysis pipeline on a target directory,
 * ensures temporary directory cleanup in a finally block,
 * and handles pipeline errors with proper HTTP responses.
 */
function analyzeDirectoryAndRespond(targetDir, res, sourceLabel = 'workspace') {
  try {
    console.log(`Analyzing repository graph in ${targetDir} (${sourceLabel})...`);
    let graph;
    try {
      const rawGraph = buildDependencyGraph(targetDir);
      graph = analyzeDependencyGraph(rawGraph, { rootDir: targetDir });
    } catch (analysisErr) {
      console.error(`Analysis error (${sourceLabel}):`, analysisErr);
      return res.status(500).json({
        error: 'Analysis pipeline failed on the provided codebase.',
        details: analysisErr.message
      });
    }

    console.log(`Analysis complete (${sourceLabel}): ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
    return res.status(200).json(graph);
  } finally {
    if (targetDir && fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        console.log(`Cleaned up temp directory: ${targetDir}`);
      } catch (cleanupErr) {
        console.error(`Failed to clean up temp dir ${targetDir}:`, cleanupErr);
      }
    }
  }
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Cockpit server is running' });
});

// Analyze GitHub repository endpoint
app.post('/api/analyze', async (req, res) => {
  const { repoUrl } = req.body || {};

  // 1. Validate GitHub URL
  const validation = validateGitHubUrl(repoUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // 2. Create unique temp directory
  let tempDir;
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-repo-'));
  } catch (err) {
    console.error('Failed to create temp directory:', err);
    return res.status(500).json({ error: 'Internal server error creating workspace' });
  }

  // 3. Shallow-clone into temp directory with timeout
  console.log(`Cloning ${validation.cleanUrl} into ${tempDir}...`);
  try {
    await cloneRepository(validation.cleanUrl, tempDir, 60000);
  } catch (cloneErr) {
    console.error('Clone error:', cloneErr);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (cloneErr.name === 'TimeoutError') {
      return res.status(408).json({
        error: 'Clone timed out. The repository took too long to download.'
      });
    }
    return res.status(422).json({
      error: 'Failed to clone repository. Ensure the repository exists and is public.',
      details: cloneErr.message
    });
  }

  // 4. Run shared analysis pipeline
  return analyzeDirectoryAndRespond(tempDir, res, validation.cleanUrl);
});

// Analyze uploaded local folder zip endpoint
app.post('/api/analyze-upload', (req, res) => {
  upload.single('bundle')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Uploaded file exceeds the maximum size limit of ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB.`
        });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No zip file provided in request. Expected field "bundle".' });
    }

    let tempDir;
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-upload-'));
    } catch (err) {
      console.error('Failed to create temp directory:', err);
      return res.status(500).json({ error: 'Internal server error creating workspace' });
    }

    try {
      let zip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch (zipErr) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return res.status(400).json({ error: 'Invalid zip archive: failed to parse zip buffer.' });
      }

      const zipEntries = zip.getEntries();
      if (zipEntries.length > MAX_FILE_COUNT) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return res.status(413).json({
          error: `Zip contains too many files (${zipEntries.length} > ${MAX_FILE_COUNT} limit).`
        });
      }

      const normalizedTempDir = path.resolve(tempDir);

      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName.replace(/\\/g, '/');

        // Security check: Zip-slip path traversal guard
        if (entryName.includes('..') || entryName.startsWith('/') || /^[a-zA-Z]:/.test(entryName)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          return res.status(400).json({ error: 'Malicious path traversal detected in zip archive.' });
        }

        const targetPath = path.resolve(normalizedTempDir, entryName);

        if (!targetPath.startsWith(normalizedTempDir + path.sep) && targetPath !== normalizedTempDir) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          return res.status(400).json({ error: 'Malicious path traversal detected in zip archive.' });
        }

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
      }
    } catch (extractErr) {
      console.error('Failed to extract zip:', extractErr);
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      return res.status(400).json({ error: 'Failed to extract uploaded zip archive.' });
    }

    // Run shared analysis pipeline on extracted temp directory
    return analyzeDirectoryAndRespond(tempDir, res, req.file.originalname || 'uploaded-folder');
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Cockpit backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
