// Mock implementation of fs-extra
const fs = jest.createMockFromModule('fs-extra');

// Mock file system store
let mockFiles = {};

// Helper function to set mock files
function __setMockFiles(newMockFiles) {
  mockFiles = { ...newMockFiles };
}

// Mock readFile implementation
function readFile(path, options, callback) {
  const encoding = typeof options === 'string' ? options : 'utf8';

  // Handle promise version
  if (!callback) {
    return new Promise((resolve, reject) => {
      if (!mockFiles[path]) {
        reject(new Error(`ENOENT: no such file or directory, open '${path}'`));
      } else {
        resolve(mockFiles[path]);
      }
    });
  }

  // Handle callback version
  if (!mockFiles[path]) {
    callback(new Error(`ENOENT: no such file or directory, open '${path}'`));
  } else {
    callback(null, mockFiles[path]);
  }
}

// Mock writeFile implementation
function writeFile(path, data, options, callback) {
  // Handle different function signatures
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // Set file content
  mockFiles[path] = data;

  // Handle promise version
  if (!callback) {
    return Promise.resolve();
  }

  // Handle callback version
  callback(null);
}

// Mock ensureDir implementation
function ensureDir(dir, callback) {
  // Handle promise version
  if (!callback) {
    return Promise.resolve();
  }

  // Handle callback version
  callback(null);
}

// Mock existsSync implementation
function existsSync(path) {
  return !!mockFiles[path];
}

// Mock implementation
fs.__setMockFiles = __setMockFiles;
fs.readFile = readFile;
fs.writeFile = writeFile;
fs.ensureDir = ensureDir;
fs.existsSync = existsSync;

module.exports = fs;
