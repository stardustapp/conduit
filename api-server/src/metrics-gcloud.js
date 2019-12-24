const monitoring = require('@google-cloud/monitoring');
const projectId = require('process').env.GCLOUD_PROJECT;
const client = new monitoring.MetricServiceClient();

exports.MetricsSubmission =
class MetricsSubmission {
  constructor(resourceLabels={}) {
    this.resourceLabels = resourceLabels;
    this.pendingSeries = new Array;
    setInterval(this.flushNow.bind(this), 30 * 1000);
  }

  async flushNow() {
    if (this.pendingSeries.length === 0) {
      // console.log('No pending metrics to flush, skipping');
    } else if (projectId) {

      // Prepares the time series request
      const request = {
        name: client.projectPath(projectId),
        timeSeries: this.pendingSeries,
      };
      // console.log(JSON.stringify(this.pendingSeries,null,2));
      this.pendingSeries = new Array;

      // Writes time series data
      const [result] = await client.createTimeSeries(request);
      console.log(`Done writing`, request.timeSeries.length, `time series data.`, result);

    } else {
      TODO(`dropping ${this.pendingSeries.length} metrics datapoints`);
      this.pendingSeries.length = 0;
    }
  }

  withNodeTimeSlot({nodeId, startTime, endTime, fixedLabels={}}) {
    startTime = { seconds: startTime / 1000 };
    endTime = { seconds: endTime / 1000 };

    const resource = {
      type: 'generic_node',
      labels: {
        ...this.resourceLabels,
        node_id: nodeId,
      },
    };

    return {
      pushMetricPoint: ({type, metricKind, labels={}, valueType='INT64', value}) => {
        // cumulative metrics are supposed to 'start' when they were last reset
        const interval = metricKind === 'CUMULATIVE'
          ? {startTime, endTime}
          : {endTime};

        this.pendingSeries.push({
          metric: {
            type,
            labels: {...labels, ...fixedLabels},
          },
          metricKind,
          resource,
          valueType,
          points: [{
            interval,
            value: {
              [`${valueType.toLowerCase()}Value`]: value,
            },
          }],
        });
      },
    };
  }
}
