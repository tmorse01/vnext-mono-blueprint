import { describe, expect, it } from 'vitest';
import { metadataDocumentSchema } from '@vnext/metadata';
import { validateMetadataValues } from './metadata.js';

describe('metadata preview validation', () => {
  it('applies required, decimal range, option, and supported-key rules to preview values', () => {
    const document = metadataDocumentSchema.parse({
      schemaVersion: 1,
      fields: [
        { key: 'loanAmount', label: 'Loan amount', order: 1, widget: 'currency', required: true, min: 1 },
        { key: 'construction.projectType', label: 'Project type', order: 2, widget: 'select', options: [{ value: 'ground_up', label: 'Ground up' }] },
      ],
      layout: {},
    });
    expect(validateMetadataValues(document, { loanAmount: '0', 'construction.projectType': 'renovation' })).toEqual([
      'loanAmount must be at least 1.',
      'construction.projectType is not an allowed option.',
    ]);
    expect(validateMetadataValues(document, { 'construction.projectType': 'ground_up' })).toContain('loanAmount is required.');
    expect(validateMetadataValues(document, { loanAmount: '4,200', 'construction.projectType': 'ground_up' })).toContain('loanAmount must be a decimal value.');
  });
});
