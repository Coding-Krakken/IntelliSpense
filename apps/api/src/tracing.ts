import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || ''
const serviceName = process.env.OTEL_SERVICE_NAME || 'intellispense-api'

// Avoid importing @opentelemetry/resources directly to prevent duplicate versions
// in the dependency graph (which causes TS type incompatibilities on private fields).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Resource } = require('@opentelemetry/resources')

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: serviceName
})

const sdk = new NodeSDK({
  resource,
  traceExporter: exporterEndpoint ? new OTLPTraceExporter({ url: exporterEndpoint }) : undefined,
  instrumentations: [getNodeAutoInstrumentations()]
})

sdk.start()

process.on('SIGTERM', async () => {
  await sdk.shutdown()
  process.exit(0)
})

console.log(`OpenTelemetry SDK started (service=${serviceName})`)
