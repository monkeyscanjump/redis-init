const {
  processTemplate,
  getCommonTemplateVariables,
  expandTemplateVariables
} = require('../lib/templates');

describe('Templates Module', () => {
  describe('processTemplate function', () => {
    test('should replace template variables', () => {
      const template = 'Hello, ${NAME}! The version is ${VERSION}.';
      const variables = {
        NAME: 'World',
        VERSION: '1.0.0'
      };

      const result = processTemplate(template, variables);
      expect(result).toBe('Hello, World! The version is 1.0.0.');
    });

    test('should leave unmatched variables untouched', () => {
      const template = 'Hello, ${NAME}! The version is ${VERSION}.';
      const variables = {
        NAME: 'World'
      };

      const result = processTemplate(template, variables);
      expect(result).toBe('Hello, World! The version is ${VERSION}.');
    });

    test('should return original content if no variables provided', () => {
      const template = 'Hello, ${NAME}!';

      expect(processTemplate(template)).toBe(template);
      expect(processTemplate(template, null)).toBe(template);
      expect(processTemplate(template, {})).toBe(template);
    });

    test('should handle multiple occurrences of the same variable', () => {
      const template = '${NAME} ${NAME} ${NAME}';
      const variables = { NAME: 'Test' };

      const result = processTemplate(template, variables);
      expect(result).toBe('Test Test Test');
    });
  });

  describe('getCommonTemplateVariables function', () => {
    test('should return common variables', () => {
      const variables = getCommonTemplateVariables();

      expect(variables).toHaveProperty('TIMESTAMP');
      expect(variables).toHaveProperty('ISO_DATE');
      expect(variables).toHaveProperty('DATE');
      expect(variables).toHaveProperty('TIME');
      expect(variables).toHaveProperty('HOSTNAME');
      expect(variables).toHaveProperty('NODE_ENV');
      expect(variables).toHaveProperty('RANDOM_ID');
    });
  });

  describe('expandTemplateVariables function', () => {
    test('should merge user variables with common variables', () => {
      const userVars = {
        APP_NAME: 'MyApp',
        APP_VERSION: '1.0.0'
      };

      const expanded = expandTemplateVariables(userVars);

      expect(expanded).toHaveProperty('APP_NAME', 'MyApp');
      expect(expanded).toHaveProperty('APP_VERSION', '1.0.0');
      expect(expanded).toHaveProperty('TIMESTAMP');
      expect(expanded).toHaveProperty('ISO_DATE');
    });

    test('should use only common variables if no user variables provided', () => {
      const expanded = expandTemplateVariables();

      expect(expanded).toHaveProperty('TIMESTAMP');
      expect(expanded).toHaveProperty('ISO_DATE');
    });

    test('should override common variables with user variables', () => {
      const userVars = {
        TIMESTAMP: 'custom-timestamp',
        NODE_ENV: 'custom-env'
      };

      const expanded = expandTemplateVariables(userVars);

      expect(expanded.TIMESTAMP).toBe('custom-timestamp');
      expect(expanded.NODE_ENV).toBe('custom-env');
    });
  });
});
