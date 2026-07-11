import assert from 'node:assert/strict';
import useEnablementStore from './useEnablementStore';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => 'token', removeItem() {} },
  configurable: true,
});

type Deferred = {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
};

const deferred = (): Deferred => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => { resolve = next; });
  return { promise, resolve };
};

const review = deferred();
const publication = deferred();
globalThis.fetch = (async (url: string | URL | Request) => (
  String(url).endsWith('/review-queue') ? review.promise : publication.promise
)) as typeof fetch;

const response = () => new Response(JSON.stringify({ code: 0, data: [], message: 'success' }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

useEnablementStore.getState().reset();
const reviewRequest = useEnablementStore.getState().loadReviewQueue();
const publicationRequest = useEnablementStore.getState().loadPublicationQueue();
assert.equal(useEnablementStore.getState().loading, true);

review.resolve(response());
await reviewRequest;
assert.equal(useEnablementStore.getState().loading, true, 'one completed request must not hide another active request');

publication.resolve(response());
await publicationRequest;
assert.equal(useEnablementStore.getState().loading, false);
