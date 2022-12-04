import { SpansContainer, TracerGlobals } from '../globals';
import * as logger from '../logger';
import { getCurrentTransactionId } from '../spans/awsSpan';
import { createMongoDbSpan, extendMongoDbSpan } from '../spans/mongoDbSpan';
import { getRandomId, safeExecute } from '../utils';

type SpanMap = {
  [requestId: string]: string;
};

const PendingRequests = (() => {
  const pendingRequests: SpanMap = {};

  const addPendingRequest = (requestId: string, spanId: string) => {
    pendingRequests[requestId] = spanId;
  };

  const popPendingRequestSpanId = (requestId: string): string => {
    const spanId: string = pendingRequests[requestId];
    delete pendingRequests[requestId];
    return spanId;
  };

  return {
    addPendingRequest,
    popPendingRequestSpanId,
  };
})();

export const onStartedHook = (event: any) => {
  const awsRequestId: string = TracerGlobals.getHandlerInputs().context.awsRequestId;
  const transactionId: string = getCurrentTransactionId();
  const { command, databaseName, commandName, requestId, operationId, connectionId } = event;
  const started: number = Date.now();
  const spanId: string = getRandomId();
  PendingRequests.addPendingRequest(requestId, spanId);
  const mongoSpan = createMongoDbSpan(
    transactionId,
    awsRequestId,
    spanId,
    {
      started,
    },
    {
      databaseName,
      commandName,
      command,
      mongoRequestId: requestId,
      mongoOperationId: operationId,
      mongoConnectionId: connectionId,
    }
  );
  SpansContainer.addSpan(mongoSpan);
};

export const onSucceededHook = (event: any) => {
  const { duration, reply, requestId } = event;
  const currentSpanId: string = PendingRequests.popPendingRequestSpanId(requestId);
  const currentSpan = SpansContainer.getSpanById(currentSpanId);
  const extendedMondoDbSpan = extendMongoDbSpan(currentSpan, {
    duration,
    reply,
  });
  SpansContainer.addSpan(extendedMondoDbSpan);
};

export const onFailedHook = (event: any) => {
  const { duration, failure, requestId } = event;
  const currentSpanId = PendingRequests.popPendingRequestSpanId(requestId);
  const currentSpan = SpansContainer.getSpanById(currentSpanId);
  const extendedMondoDbSpan = extendMongoDbSpan(currentSpan, {
    duration,
    failure,
  });
  SpansContainer.addSpan(extendedMondoDbSpan);
};

export const configureMongoClient3xInstrumentation = (mongoClientLibrary: any) => {
  const listener = mongoClientLibrary.instrument({}, (err: any) => {
    if (err) {
      logger.warn('MongoDB 3.x instrumentation failed ', err);
    }
  });

  const safeStartedHook: Function = safeExecute(onStartedHook);
  const safeSucceededHook: Function = safeExecute(onSucceededHook);
  const safeFailedHook: Function = safeExecute(onFailedHook);

  safeExecute(() => {
    listener.on('started', safeStartedHook);
    listener.on('succeeded', safeSucceededHook);
    listener.on('failed', safeFailedHook);
  })();
};