// اختبار حمل: k6 run -e API=https://cottanbackend.hussaindark6.workers.dev -e PHARMACY=cottanpharmacy loadtest/storefront.k6.js
// لا ينشئ طلبات حقيقية. لاختبار /api/orders استخدمي صيدلية تجريبية فقط وعدّلي الهدف أدناه.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API, P = __ENV.PHARMACY || 'cottanpharmacy';
export const options = {
  stages: [{ duration: '1m', target: 50 }, { duration: '3m', target: 150 }, { duration: '1m', target: 0 }],
  thresholds: { http_req_failed: ['rate<0.02'], http_req_duration: ['p(95)<800'] },
};

export default function () {
  const sf = http.get(`${API}/api/storefront?pharmacy=${P}`);
  check(sf, { 'storefront 200/304': r => r.status === 200 || r.status === 304 });
  const cat = http.get(`${API}/api/catalog?pharmacy=${P}`);
  check(cat, { 'catalog 200/304': r => r.status === 200 || r.status === 304 });
  const mf = http.get(`${API}/api/manifest?pharmacy=${P}`);
  check(mf, { 'manifest 200': r => r.status === 200 });
  sleep(1);
}
