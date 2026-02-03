import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
// require Resource at runtime to avoid TS value/type-only mismatch
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
const ResourceModule = require('@opentelemetry/resources')

const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || ''
const serviceName = process.env.OTEL_SERVICE_NAME || 'intellispense-api'

let resource: any
// Support multiple OpenTelemetry versions: prefer Resource.create, then constructor
if (ResourceModule && typeof ResourceModule.create === 'function') {
  resource = ResourceModule.create({ [SemanticResourceAttributes.SERVICE_NAME]: serviceName })
} else if (ResourceModule && ResourceModule.Resource && typeof ResourceModule.Resource === 'function') {
  resource = new ResourceModule.Resource({ [SemanticResourceAttributes.SERVICE_NAME]: serviceName })
} else if (ResourceModule && typeof ResourceModule === 'function') {
  // some builds export the constructor directly
  resource = new ResourceModule({ [SemanticResourceAttributes.SERVICE_NAME]: serviceName })
} else {
  resource = undefined
}

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
