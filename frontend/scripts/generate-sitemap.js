import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurations
const BASE_URL = 'https://omego.vercel.app';
const FRONTEND_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(FRONTEND_DIR, 'public');
const SITEMAP_PATH = path.resolve(PUBLIC_DIR, 'sitemap.xml');

// Files and folders to ignore
const IGNORED_DIRS = ['node_modules', 'dist', 'public', 'scripts', '.git'];
const IGNORED_FILES = [];

// Helper to get last git commit date for a file
function getGitLastMod(filePath) {
  try {
    // Run git log to get the ISO 8601 author date of the last commit for this file
    const stdout = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      cwd: FRONTEND_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    if (stdout) {
      // Extract only the date part YYYY-MM-DD
      return stdout.split('T')[0];
    }
  } catch (err) {
    // Fallback to filesystem mtime below
  }
  return null;
}

// Helper to get all HTML files recursively
function getHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.includes(file)) {
        getHtmlFiles(filePath, fileList);
      }
    } else if (file.endsWith('.html')) {
      if (!IGNORED_FILES.includes(file)) {
        fileList.push({
          filePath,
          mtime: stat.mtime
        });
      }
    }
  });
  
  return fileList;
}

// Map HTML file to its clean URL path and default settings
function mapFileToUrl(fileInfo) {
  const relativePath = path.relative(FRONTEND_DIR, fileInfo.filePath).replace(/\\/g, '/');
  
  let cleanPath = '';
  let priority = '0.50';
  let changefreq = 'monthly';
  
  if (relativePath === 'index.html') {
    cleanPath = '/';
    priority = '1.00';
    changefreq = 'daily';
  } else if (relativePath.endsWith('/index.html')) {
    // e.g., blog/index.html -> /blog
    cleanPath = '/' + relativePath.slice(0, -11);
    if (cleanPath === '/blog') {
      priority = '0.80';
      changefreq = 'daily';
    } else {
      priority = '0.80';
      changefreq = 'weekly';
    }
  } else {
    // e.g., terms.html -> /terms, blog/post.html -> /blog/post
    cleanPath = '/' + relativePath.slice(0, -5);
    if (cleanPath === '/terms') {
      priority = '0.30';
      changefreq = 'monthly';
    } else if (cleanPath.startsWith('/blog/')) {
      priority = '0.70';
      changefreq = 'monthly';
    } else {
      priority = '0.80';
      changefreq = 'weekly';
    }
  }
  
  // Try to get date from Git history, fallback to filesystem mtime
  let lastmod = getGitLastMod(fileInfo.filePath);
  if (!lastmod) {
    lastmod = fileInfo.mtime.toISOString().split('T')[0];
  }
  
  return {
    loc: `${BASE_URL}${cleanPath}`,
    lastmod,
    changefreq,
    priority
  };
}

function generateSitemap() {
  console.log('Scanning for HTML files to generate sitemap.xml...');
  const htmlFiles = getHtmlFiles(FRONTEND_DIR);
  
  const urls = [];
  htmlFiles.forEach(fileInfo => {
    const urlObj = mapFileToUrl(fileInfo);
    urls.push(urlObj);
    
    // Include the /?start=text URL variant to match the 12-page indexing configuration
    if (urlObj.loc === `${BASE_URL}/`) {
      urls.push({
        loc: `${BASE_URL}/?start=text`,
        lastmod: urlObj.lastmod,
        changefreq: 'daily',
        priority: '0.64'
      });
    }
  });
  
  // Sort URLs for consistent output: root first, then by priority, then alphabetically
  urls.sort((a, b) => {
    if (a.loc === `${BASE_URL}/`) return -1;
    if (b.loc === `${BASE_URL}/`) return 1;
    const priDiff = parseFloat(b.priority) - parseFloat(a.priority);
    if (priDiff !== 0) return priDiff;
    return a.loc.localeCompare(b.loc);
  });
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
  
  urls.forEach(url => {
    xml += `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>\n`;
  });
  
  xml += `</urlset>\n`;
  
  // Ensure public directory exists
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  
  fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
  console.log(`Successfully generated sitemap.xml with ${urls.length} URLs at: ${SITEMAP_PATH}`);
}

generateSitemap();
