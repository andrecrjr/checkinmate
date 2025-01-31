const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const CONFIG = {
  skip: new Set(['node_modules', '.git', '.vscode', 'dist', 'build', 'ui']),
  extensions: new Set(['.ts', '.tsx', '.jsx', '.js']),
  maxLineLength: 80,
  maxFileSize: 1024 * 1024, // 1MB
  chunkSize: 512 * 1024,    // 512KB
};

// Enhanced minifiers for different file types
const minifiers = {
  // Base JS minifier with common patterns
  js: content => content
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    // Remove console statements
    .replace(/console\.(log|error|warn|info|debug).*?;/g, '')
    // Shorten common keywords
    .replace(/\b(const|let|var)\b/g, 'let')
    .replace(/\b(function)\b/g, 'fn')
    .replace(/\b(return)\b/g, 'ret')
    .replace(/\b(undefined)\b/g, 'undef')
    .replace(/\b(null)\b/g, 'nil')
    // Remove whitespace around operators
    .replace(/\s*([=+\-*/%&|^<>!?:;,{}()[\]])\s*/g, '$1')
    // Collapse remaining whitespace
    .replace(/\s+/g, ' ')
    // Remove empty lines
    .replace(/^\s*[\r\n]/gm, '')
    .trim(),

  // TypeScript specific minifier
  ts: content => content
    // Apply base JS minification
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    .replace(/console\.(log|error|warn|info|debug).*?;/g, '')
    // Remove type annotations
    .replace(/:\s*([A-Za-z<>[\]{}|&]+)(\s*[,=)])/g, '$2')
    // Simplify interface declarations
    .replace(/interface\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*{\s*([^}]*)\s*}/g, 'type $1={$2}')
    // Simplify type declarations
    .replace(/type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/g, 't$1=')
    // Remove readonly keyword
    .replace(/\breadonly\b\s*/g, '')
    // Simplify generic type parameters
    .replace(/<([A-Za-z_$][A-Za-z0-9_$]*)\s+extends\s+([^>]+)>/g, '<$1>')
    // Shorten common TS keywords
    .replace(/\b(interface)\b/g, 'if')
    .replace(/\b(extends)\b/g, 'ext')
    .replace(/\b(implements)\b/g, 'impl')
    // Apply common JS minification
    .replace(/\b(const|let|var)\b/g, 'let')
    .replace(/\b(function)\b/g, 'fn')
    .replace(/\b(return)\b/g, 'ret')
    .replace(/\s+/g, ' ')
    .trim(),

  // JSX/TSX specific minifier
  jsx: content => content
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    // Remove console statements
    .replace(/console\.(log|error|warn|info|debug).*?;/g, '')
    // Simplify React imports
    .replace(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]react['"]/g, 'import{$1}from"react"')
    // Simplify component props interface
    .replace(/interface\s+(\w+Props)\s*{\s*([^}]*)\s*}/g, 'type $1={$2}')
    // Shorten common React patterns
    .replace(/useState</g, 'use<')
    .replace(/useEffect/g, 'uEf')
    .replace(/useCallback/g, 'uCb')
    .replace(/useMemo/g, 'uMem')
    .replace(/useRef/g, 'uRef')
    // Simplify className assignments
    .replace(/className=\{`([^`]+)`\}/g, 'className="$1"')
    // Remove unnecessary fragments
    .replace(/<>([^<>]+)<\/>/g, '$1')
    // Minify inline styles
    .replace(/style=\{{([^}]+)}\}/g, (match, styles) => {
      const minified = styles
        .replace(/:\s+/g, ':')
        .replace(/,\s+/g, ',');
      return `style={{${minified}}}`;
    })
    // Apply common JS minification
    .replace(/\b(const|let|var)\b/g, 'let')
    .replace(/\b(function)\b/g, 'fn')
    .replace(/\b(return)\b/g, 'ret')
    .replace(/\s+/g, ' ')
    .trim(),

  // Alias tsx to use jsx minifier
  tsx: content => minifiers.jsx(content),

  // Default minifier for unknown types
  default: content => content
    .replace(/\s+/g, ' ')
    .trim()
};

function getMinifier(ext) {
  return minifiers[ext.slice(1)] || minifiers.default;
}

// Rest of the code remains the same as in the previous version...
async function getCodeFiles(rootDir) {
  const results = [];
  
  async function traverse(dir) {
    if (CONFIG.skip.has(path.basename(dir))) return;
    
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (CONFIG.extensions.has(path.extname(fullPath).toLowerCase())) {
        const stats = await stat(fullPath);
        if (stats.size <= CONFIG.maxFileSize) {
          results.push(fullPath);
        }
      }
    }
  }
  
  await traverse(rootDir);
  return results;
}

async function processFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  const minify = getMinifier(ext);
  const minified = minify(content);
  
  const chunks = [];
  for (let i = 0; i < minified.length; i += CONFIG.maxLineLength) {
    chunks.push(minified.slice(i, i + CONFIG.maxLineLength));
  }
  
  return {
    path: filePath.replace(process.cwd(), ''),
    content: chunks.join('\n')
  };
}

async function createCombinedFile(files, outputPath) {
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const filePath of files) {
    try {
      const { path: relativePath, content } = await processFile(filePath);
      const fileContent = `\n### ${relativePath}\n${content}`;
      
      if ((currentChunk.length + fileContent.length) > CONFIG.chunkSize) {
        await writeFile(`${outputPath}.${chunkIndex}.txt`, currentChunk);
        currentChunk = '';
        chunkIndex++;
      }
      
      currentChunk += fileContent;
    } catch (error) {
      console.error(`Skipped ${filePath}: ${error.message}`);
    }
  }
  
  if (currentChunk) {
    await writeFile(`${outputPath}.${chunkIndex}.txt`, currentChunk);
  }
  
  return chunkIndex + 1;
}

(async () => {
  try {
    const rootDir = process.argv[2] || '.';
    const outputFile = process.argv[3] || 'combined.min';
    
    const files = await getCodeFiles(path.resolve(rootDir));
    console.log(`Processing ${files.length} files...`);
    
    const chunks = await createCombinedFile(files, outputFile);
    
    console.log('Summary:');
    for (let i = 0; i < chunks; i++) {
      const stats = fs.statSync(`${outputFile}.${i}.txt`);
      console.log(`Chunk ${i}: ${(stats.size / 1024).toFixed(2)} KB`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();