import type { Kysely } from 'kysely';
import { asDecimalString, type Database } from '../types/database.js';

const id = {
  unit: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  person: '00000000-0000-4000-8000-000000000003',
  constructionProgram: '00000000-0000-4000-8000-000000000004',
  dscrProgram: '00000000-0000-4000-8000-000000000005',
  constructionProduct: '00000000-0000-4000-8000-000000000006',
  dscrProduct: '00000000-0000-4000-8000-000000000007',
  constructionVersion: '00000000-0000-4000-8000-000000000008',
  dscrVersion: '00000000-0000-4000-8000-000000000009',
  constructionLoan: '00000000-0000-4000-8000-000000000010',
  dscrLoan: '00000000-0000-4000-8000-000000000011',
  constructionScenario: '00000000-0000-4000-8000-000000000012',
  dscrScenario: '00000000-0000-4000-8000-000000000013',
  pricingConfiguration: '00000000-0000-4000-8000-000000000014',
  pricingVersion: '00000000-0000-4000-8000-000000000015',
  metadataRevision: '00000000-0000-4000-8000-000000000016',
  role: '00000000-0000-4000-8000-000000000017',
};

/** Re-runnable synthetic fixtures; this intentionally creates no login credentials. */
export async function seedDevelopmentData(db: Kysely<Database>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const unit = await trx.selectFrom('core.BusinessUnit').select('id').where('id', '=', id.unit).executeTakeFirst();
    if (!unit) await trx.insertInto('core.BusinessUnit').values({ id: id.unit, code: 'DEMO', name: 'Demonstration Lending', isActive: true, updatedAt: new Date() }).execute();

    const org = await trx.selectFrom('core.Organization').select('id').where('id', '=', id.org).executeTakeFirst();
    if (!org) await trx.insertInto('core.Organization').values({ id: id.org, name: 'Example Residential Partners', legalName: 'Example Residential Partners LLC', organizationType: 'borrower', externalReference: null, updatedAt: new Date() }).execute();
    const person = await trx.selectFrom('core.Person').select('id').where('id', '=', id.person).executeTakeFirst();
    if (!person) await trx.insertInto('core.Person').values({ id: id.person, givenName: 'Jordan', familyName: 'Example', email: 'jordan@example.test', phone: null, updatedAt: new Date() }).execute();
    const orgPerson = await trx.selectFrom('core.OrganizationPerson').select('personId').where('organizationId', '=', id.org).where('personId', '=', id.person).where('relationshipRole', '=', 'principal').executeTakeFirst();
    if (!orgPerson) await trx.insertInto('core.OrganizationPerson').values({ organizationId: id.org, personId: id.person, relationshipRole: 'principal', isPrimary: true }).execute();

    for (const program of [
      { id: id.constructionProgram, code: 'DEMO-CONSTRUCTION', name: 'Illustrative Construction', productFamily: 'construction' as const },
      { id: id.dscrProgram, code: 'DEMO-DSCR', name: 'Illustrative DSCR', productFamily: 'dscr' as const },
    ]) {
      if (!(await trx.selectFrom('lending.LoanProgram').select('id').where('id', '=', program.id).executeTakeFirst())) {
        await trx.insertInto('lending.LoanProgram').values({ ...program, isActive: true }).execute();
      }
    }
    for (const product of [
      { id: id.constructionProduct, programId: id.constructionProgram, code: 'DEMO-GROUND-UP', name: 'Ground-up Construction' },
      { id: id.dscrProduct, programId: id.dscrProgram, code: 'DEMO-RENTAL', name: 'Rental DSCR' },
    ]) {
      if (!(await trx.selectFrom('lending.LoanProduct').select('id').where('id', '=', product.id).executeTakeFirst())) {
        await trx.insertInto('lending.LoanProduct').values({ ...product, isActive: true }).execute();
      }
    }
    for (const version of [
      { id: id.constructionVersion, productId: id.constructionProduct, versionNumber: 1, terms: { illustrative: true, maxLtv: '0.70' } },
      { id: id.dscrVersion, productId: id.dscrProduct, versionNumber: 1, terms: { illustrative: true, minimumDscr: '1.00' } },
    ]) {
      if (!(await trx.selectFrom('lending.ProductVersion').select('id').where('id', '=', version.id).executeTakeFirst())) {
        await trx.insertInto('lending.ProductVersion').values({ ...version, terms: JSON.stringify(version.terms), effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null }).execute();
      }
    }
    for (const productId of [id.constructionProduct, id.dscrProduct]) {
      if (!(await trx.selectFrom('lending.BusinessUnitProduct').select('productId').where('businessUnitId', '=', id.unit).where('productId', '=', productId).executeTakeFirst())) {
        const versionId = productId === id.constructionProduct ? id.constructionVersion : id.dscrVersion;
        await trx.insertInto('lending.BusinessUnitProduct').values({ businessUnitId: id.unit, productId, isEnabled: true, defaultProductVersionId: versionId }).execute();
      }
    }

    for (const loan of [
      { id: id.constructionLoan, loanNumber: 'DEMO-1001', status: 'draft' },
      { id: id.dscrLoan, loanNumber: 'DEMO-1002', status: 'draft' },
    ]) {
      if (!(await trx.selectFrom('lending.Loan').select('id').where('id', '=', loan.id).executeTakeFirst())) {
        await trx.insertInto('lending.Loan').values({ ...loan, businessUnitId: id.unit, updatedAt: new Date() }).execute();
      }
      if (!(await trx.selectFrom('lending.LoanOrganization').select('loanId').where('loanId', '=', loan.id).where('organizationId', '=', id.org).where('relationshipRole', '=', 'borrower').executeTakeFirst())) {
        await trx.insertInto('lending.LoanOrganization').values({ loanId: loan.id, organizationId: id.org, relationshipRole: 'borrower' }).execute();
      }
    }
    for (const scenario of [
      { id: id.constructionScenario, loanId: id.constructionLoan, productVersionId: id.constructionVersion, name: 'Example 12-unit build', interestRate: asDecimalString('0.082500'), termMonths: 18 },
      { id: id.dscrScenario, loanId: id.dscrLoan, productVersionId: id.dscrVersion, name: 'Example rental property', interestRate: asDecimalString('0.079500'), termMonths: 360 },
    ]) {
      if (!(await trx.selectFrom('lending.LoanScenario').select('id').where('id', '=', scenario.id).executeTakeFirst())) {
        await trx.insertInto('lending.LoanScenario').values({ ...scenario, status: 'draft', metadataRevisionId: null, createdByUserId: null, updatedAt: new Date() }).execute();
      } else {
        await trx.updateTable('lending.LoanScenario').set({ interestRate: scenario.interestRate }).where('id', '=', scenario.id).where('interestRate', 'is', null).execute();
        await trx.updateTable('lending.LoanScenario').set({ termMonths: scenario.termMonths }).where('id', '=', scenario.id).where('termMonths', 'is', null).execute();
      }
    }
    if (!(await trx.selectFrom('lending.ConstructionScenarioDetail').select('scenarioId').where('scenarioId', '=', id.constructionScenario).executeTakeFirst())) {
      await trx.insertInto('lending.ConstructionScenarioDetail').values({ scenarioId: id.constructionScenario, projectType: 'ground_up', requestedLoanAmount: asDecimalString('2400000.0000'), asIsValue: asDecimalString('3000000.0000'), afterRepairValue: asDecimalString('4100000.0000'), totalProjectCost: asDecimalString('3200000.0000'), constructionMonths: 18, units: 12 }).execute();
    }
    if (!(await trx.selectFrom('lending.DscrScenarioDetail').select('scenarioId').where('scenarioId', '=', id.dscrScenario).executeTakeFirst())) {
      await trx.insertInto('lending.DscrScenarioDetail').values({ scenarioId: id.dscrScenario, requestedLoanAmount: asDecimalString('640000.0000'), purchasePrice: asDecimalString('800000.0000'), propertyValue: asDecimalString('825000.0000'), monthlyRent: asDecimalString('7200.0000'), monthlyExpenses: asDecimalString('900.0000'), monthlyTaxes: asDecimalString('650.0000'), monthlyInsurance: asDecimalString('250.0000'), monthlyHoa: asDecimalString('0.0000'), dscr: asDecimalString('1.4200'), units: 4 }).execute();
    } else {
      await trx.updateTable('lending.DscrScenarioDetail').set({ monthlyExpenses: asDecimalString('900.0000') }).where('scenarioId', '=', id.dscrScenario).where('monthlyExpenses', 'is', null).execute();
    }

    if (!(await trx.selectFrom('lending.PricingConfiguration').select('id').where('id', '=', id.pricingConfiguration).executeTakeFirst())) {
      await trx.insertInto('lending.PricingConfiguration').values({ id: id.pricingConfiguration, code: 'DEMO-FIXED', name: 'Illustrative fixed pricing', isActive: true }).execute();
    }
    if (!(await trx.selectFrom('lending.PricingVersion').select('id').where('id', '=', id.pricingVersion).executeTakeFirst())) {
      await trx.insertInto('lending.PricingVersion').values({ id: id.pricingVersion, pricingConfigurationId: id.pricingConfiguration, versionNumber: 1, parameters: JSON.stringify({ baseRate: '0.0825', points: '1.0000', illustrative: true }) }).execute();
    }

    for (const [roleId, code, name] of [[id.role, 'demo-reader', 'Demonstration reader']] as const) {
      if (!(await trx.selectFrom('iam.Role').select('id').where('id', '=', roleId).executeTakeFirst())) {
        await trx.insertInto('iam.Role').values({ id: roleId, code, name }).execute();
      }
    }
    const permissions = [
      ['00000000-0000-4000-8000-000000000018', 'scenarios.read', 'Read scenarios'],
      ['00000000-0000-4000-8000-000000000019', 'audit.read', 'Read audit events'],
    ] as const;
    for (const [permissionId, key, description] of permissions) {
      if (!(await trx.selectFrom('iam.Permission').select('id').where('id', '=', permissionId).executeTakeFirst())) {
        await trx.insertInto('iam.Permission').values({ id: permissionId, key, description }).execute();
      }
      if (!(await trx.selectFrom('iam.RolePermission').select('roleId').where('roleId', '=', id.role).where('permissionId', '=', permissionId).executeTakeFirst())) {
        await trx.insertInto('iam.RolePermission').values({ roleId: id.role, permissionId }).execute();
      }
    }

    // Keep an illustrative platform revision available for demos; no business-unit override is seeded.
    if (!(await trx.selectFrom('config.MetadataRevision').select('id').where('id', '=', id.metadataRevision).executeTakeFirst())) {
      await trx.insertInto('config.MetadataRevision').values({
        id: id.metadataRevision,
        productFamily: 'construction',
        businessUnitId: null,
        revisionNumber: 1,
        state: 'published',
        document: JSON.stringify({
          schemaVersion: 1,
          fields: [
            { key: 'name', label: 'Scenario name', group: 'Loan details', order: 1, widget: 'text', required: true, minLength: 2, maxLength: 120, tableColumn: false },
            { key: 'loanAmount', label: 'Requested loan amount', group: 'Loan details', order: 2, widget: 'currency', required: true, min: 1, tableColumn: true },
            { key: 'rate', label: 'Illustrative interest rate', group: 'Loan details', order: 3, widget: 'percent', required: true, min: 0, max: 100, tableColumn: false },
            { key: 'termMonths', label: 'Term', group: 'Loan details', order: 4, widget: 'number', required: true, min: 1, max: 600, tableColumn: false },
            { key: 'construction.projectType', label: 'Project type', group: 'Construction plan', order: 10, widget: 'select', required: true, options: [{ value: 'ground_up', label: 'Ground-up construction' }, { value: 'renovation', label: 'Renovation' }], tableColumn: false },
            { key: 'construction.constructionMonths', label: 'Construction period', group: 'Construction plan', order: 11, widget: 'number', required: true, min: 1, max: 60, tableColumn: false },
          ],
          layout: { navigation: 'standard' },
        }),
        createdByUserId: null,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
      }).execute();
    }
    if (!(await trx.selectFrom('config.MetadataPublication').select('metadataRevisionId').where('productFamily', '=', 'construction').where('scopeKey', '=', 'platform').executeTakeFirst())) {
      await trx.insertInto('config.MetadataPublication').values({ productFamily: 'construction', scopeKey: 'platform', businessUnitId: null, metadataRevisionId: id.metadataRevision, publishedAt: new Date('2026-01-01T00:00:00Z') }).execute();
    }
  });

}
