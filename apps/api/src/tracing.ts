import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || ''
const serviceName = process.env.OTEL_SERVICE_NAME || 'intellispense-api'

// Avoid importing @opentelemetry/resources via ESM to reduce the chance of
// duplicate versions in the dependency graph.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const otelResources = require('@opentelemetry/resources')

const resourceAttributes = {
  [SemanticResourceAttributes.SERVICE_NAME]: serviceName
}

// @opentelemetry/resources exports differ across major versions.
// Prefer the newer factory if present, otherwise fall back to the legacy Resource class.
const resource =
  typeof otelResources.resourceFromAttributes === 'function'
    ? otelResources.resourceFromAttributes(resourceAttributes)
    : otelResources.Resource
      ? new otelResources.Resource(resourceAttributes)
      : undefined

const sdk = new NodeSDK({
  ...(resource ? { resource } : {}),
  traceExporter: exporterEndpoint ? new OTLPTraceExporter({ url: exporterEndpoint }) : undefined,
  instrumentations: [getNodeAutoInstrumentations()]
})

try {
  const startResult = sdk.start()
  Promise.resolve(startResult)
    .then(() => {
      // eslint-disable-next-line no-console
      console.log(`OpenTelemetry SDK started (service=${serviceName})`)
    })
    .catch((err: unknown) => {
      // Tracing must never prevent the API from starting (especially in CI/E2E).
      // eslint-disable-next-line no-console
      console.warn('OpenTelemetry SDK failed to start (continuing without tracing)', err)
    })
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('OpenTelemetry SDK failed to start (continuing without tracing)', err)
}

process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown()
  } finally {
    process.exit(0)
  }
})
