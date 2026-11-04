const text = (max = 500) => ({ type: 'string', minLength: 1, maxLength: max });
const name = text(80);
const sourceIds = { type: 'array', items: text(40), uniqueItems: true, maxItems: 30 };
const note = { type: 'string', maxLength: 2000 };
const key = { type: 'integer', minimum: 0, maximum: 99 };
const frequency = {
  type: 'string',
  pattern: '^[0-9]{2,3}\\.[0-9]{1,5}$',
  description:
    'MHz as a decimal string, e.g. 162.5500; never a repeater input unless deliberately listening to it.',
};
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const list = (items, maxItems, minItems = 0) => ({ type: 'array', items, minItems, maxItems });
const common = { name, sourceIds, notes: note };
export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/valish/mac-uniden-bcd325p2/blob/main/schemas/plan.schema.json',
  title: 'Uniden BCD325P2 portable channel plan',
  ...object(
    {
      format: { const: 'bcd325p2-plan-v1' },
      title: text(120),
      example: {
        type: 'boolean',
        description:
          'Examples cannot be programmed until adapted and this flag is removed or false.',
      },
      namespace: {
        type: 'string',
        pattern: '^[A-Z][A-Z0-9]{1,3}$',
        description:
          'A short prefix that distinguishes this plan from other scanner systems, e.g. MU.',
      },
      areas: list(text(120), 20),
      researchDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      notes: note,
      sources: list(
        object({
          id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,40}$' },
          title: text(200),
          url: { type: 'string', pattern: '^https?://', maxLength: 2000 },
          checked: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        }),
        200,
      ),
      systems: list(
        object(
          {
            name,
            type: { enum: ['CNV', 'P25S'] },
            quickKey: key,
            enabled: { type: 'boolean' },
            notes: note,
            groups: list(
              object(
                {
                  name,
                  quickKey: { type: 'integer', minimum: 0, maximum: 9 },
                  channels: list(
                    object(
                      {
                        ...common,
                        frequencyMHz: frequency,
                        mode: { enum: ['AM', 'FM', 'NFM', 'FMB', 'P25'] },
                        tgid: { type: 'integer', minimum: 1, maximum: 65535 },
                        encryption: { enum: ['clear', 'unknown'] },
                      },
                      ['name'],
                    ),
                    1000,
                    1,
                  ),
                },
                ['name', 'quickKey', 'channels'],
              ),
              20,
              1,
            ),
            sites: list(
              object({ ...common, frequencies: list(frequency, 100, 1) }, ['name', 'frequencies']),
              256,
              1,
            ),
          },
          ['name', 'type', 'quickKey', 'enabled', 'groups'],
        ),
        500,
        1,
      ),
      excluded: list(object({ ...common, reason: text(1000) }, ['name', 'reason']), 500),
    },
    ['format', 'title', 'namespace', 'areas', 'researchDate', 'sources', 'systems'],
  ),
};
