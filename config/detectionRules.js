const detectionRules = [
    {
        language: 'JavaScript',
        projectType: 'Node.js',
        markers: [
            'package.json'
        ],
        priority: 10
    },
    {
        language: 'TypeScript',
        projectType: 'TypeScript',
        markers: [
            'tsconfig.json'
        ],
        priority: 1
    },
    {
        language: 'Python',
        projectType: 'Python',
        markers: [
            'pyproject.toml',
            'requirements.txt',
            'setup.py'
        ],
        priority: 5
    },
    {
        language: 'Java',
        projectType: 'Java',
        markers: [
            'pom.xml',
            'build.gradle',
            'build.gradle.kts'
        ],
        priority: 5
    },
    {
        language: 'Go',
        projectType: 'Go',
        markers: [
            'go.mod'
        ],
        priority: 5
    },
    {
        language: 'Rust',
        projectType: 'Rust',
        markers: [
            'Cargo.toml'
        ],
        priority: 5
    },
    {
        language: 'PHP',
        projectType: 'PHP',
        markers: [
            'composer.json'
        ],
        priority: 5
    },
    {
        language: 'C/C++',
        projectType: 'Native',
        markers: [
            'CMakeLists.txt',
            'Makefile'
        ],
        priority: 5
    },
    {
        language: 'C#',
        projectType: '.NET',
        markers: [
            '*.csproj',
            '*.sln'
        ],
        priority: 5
    },
    {
        language: 'Ruby',
        projectType: 'Ruby',
        markers: [
            'Gemfile',
            '*.gemspec'
        ],
        priority: 5
    },
    {
        language: 'Swift',
        projectType: 'Swift',
        markers: [
            'Package.swift'
        ],
        priority: 5
    }
];

module.exports = detectionRules;
