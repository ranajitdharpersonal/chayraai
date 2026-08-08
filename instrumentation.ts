// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { TraceExporter } = await import('@google-cloud/opentelemetry-cloud-trace-exporter');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

    const sdk = new NodeSDK({
      traceExporter: new TraceExporter(),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    console.log('[Observability]: Google Cloud OpenTelemetry Tracing Initialized.');
  }
}