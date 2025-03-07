/**
 * Template support module
 *
 * Handles schema template variables.
 */

/**
 * Process template variables in content
 * @param {string} content - Content with template variables
 * @param {Object} variables - Variables to replace
 * @returns {string} - Processed content
 */
function processTemplate(content, variables) {
  if (!variables || typeof variables !== 'object' || Object.keys(variables).length === 0) {
    return content;
  }

  return content.replace(/\${([^}]+)}/g, (match, varName) => {
    // Use variable value if defined, otherwise keep the template marker
    return variables[varName] !== undefined ? variables[varName] : match;
  });
}

/**
 * Get commonly used template variables
 * @returns {Object} - Common template variables
 */
function getCommonTemplateVariables() {
  return {
    TIMESTAMP: Date.now().toString(),
    ISO_DATE: new Date().toISOString(),
    DATE: new Date().toISOString().split('T')[0],
    TIME: new Date().toISOString().split('T')[1].split('.')[0],
    HOSTNAME: require('os').hostname(),
    NODE_ENV: process.env.NODE_ENV || 'development',
    RANDOM_ID: Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
  };
}

/**
 * Expand template variables with common variables
 * @param {Object} variables - User-provided variables
 * @returns {Object} - Expanded variables
 */
function expandTemplateVariables(variables = {}) {
  return {
    ...getCommonTemplateVariables(),
    ...variables
  };
}

module.exports = {
  processTemplate,
  getCommonTemplateVariables,
  expandTemplateVariables
};
