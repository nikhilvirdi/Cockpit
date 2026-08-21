const detectionRules = [
    {
        language: 'JavaScript',
        projectType: 'Node.js',
        markers: [
            'package.json'
        ]
    },
    {
        language: 'TypeScript',
        projectType: 'TypeScript',
        markers: [
            'tsconfig.json'
        ]
    },
    {
        language: 'Python',
        projectType: 'Python',
        markers: [
            'pyproject.toml',
            'requirements.txt',
            'setup.py'
        ]
    },
    {
        language: 'Java',
        projectType: 'Java',
        markers: [
            'pom.xml',
            'build.gradle',
            'build.gradle.kts'
        ]
    },
    {
        language: 'Go',
        projectType: 'Go',
        markers: [
            'go.mod'
        ]
    },
    {
        language: 'Rust',
        projectType: 'Rust',
        markers: [
            'Cargo.toml'
        ]
    },
    {
        language: 'PHP',
        projectType: 'PHP',
        markers: [
            'composer.json'
        ]
    },
    {
        language: 'C/C++',
        projectType: 'Native',
        markers: [
            'CMakeLists.txt',
            'Makefile'
        ]
    },
    {
        language: 'C#',
        projectType: '.NET',
        markers: [
            '*.csproj',
            '*.sln'
        ]
    },
    {
        language: 'Ruby',
        projectType: 'Ruby',
        markers: [
            'Gemfile',
            '*.gemspec'
        ]
    },
    {
        language: 'Swift',
        projectType: 'Swift',
        markers: [
            'Package.swift'
        ]
    }
];

module.exports = detectionRules;