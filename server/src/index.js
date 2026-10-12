const express = require('express');
const cors = require('cors');
const { simpleGit } = require('simple-git');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { buildDependencyGraph, analyzeDependencyGraph } = require('@cockpit/core');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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

  try {
    // 3. Shallow-clone into temp directory with timeout
    console.log(`Cloning ${validation.cleanUrl} into ${tempDir}...`);
    try {
      await cloneRepository(validation.cleanUrl, tempDir, 60000);
    } catch (cloneErr) {
      console.error('Clone error:', cloneErr);
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

    // 4. Run core pipeline
    console.log(`Analyzing repository graph in ${tempDir}...`);
    let graph;
    try {
      const rawGraph = buildDependencyGraph(tempDir);
      graph = analyzeDependencyGraph(rawGraph, { rootDir: tempDir });
    } catch (analysisErr) {
      console.error('Analysis error:', analysisErr);
      return res.status(500).json({
        error: 'Analysis pipeline failed on the cloned repository.',
        details: analysisErr.message
      });
    }

    console.log(`Analysis complete: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
    return res.status(200).json(graph);
  } finally {
    // 5. Cleanup temp directory always
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        console.log(`Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupErr) {
        console.error(`Failed to clean up temp dir ${tempDir}:`, cleanupErr);
      }
    }
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Cockpit backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
