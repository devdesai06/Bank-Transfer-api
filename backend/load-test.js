import http from 'k6/http';
import { check } from 'k6';

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export const options = {
    stages: [
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '30s', target: 400 },
    ],

    thresholds: {
        http_req_failed: ['rate<0.05'],
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = 'http://localhost:3000';
const TOKEN = __ENV.JWT_TOKEN;

// 1. SETUP PHASE: Creates the sender and receiver accounts with sufficient balance
export function setup() {
    const params = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
        },
    };

    const senderRes = http.post(
        `${BASE_URL}/api/account/create-account`,
        JSON.stringify({ name: 'Load Test Sender', balance: 1000000000 }),
        params
    );

    const receiverRes = http.post(
        `${BASE_URL}/api/account/create-account`,
        JSON.stringify({ name: 'Load Test Receiver', balance: 0 }),
        params
    );

    const sender = JSON.parse(senderRes.body);
    const receiver = JSON.parse(receiverRes.body);

    if (!sender.data || !receiver.data) {
        throw new Error(`Failed to initialize accounts: Sender = ${senderRes.body}, Receiver = ${receiverRes.body}`);
    }

    return {
        fromAccountId: sender.data.id,
        toAccountId: receiver.data.id,
    };
}

// 2. VU EXECUTION PHASE: Runs repeatedly in parallel loops
export default function (data) {
    const payload = JSON.stringify({
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: 10,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
            'Idempotency-Key': uuidv4(), 
        },
    };

    const response = http.post(
        `${BASE_URL}/api/transfers`,
        payload,
        params
    );

    check(response, {
        'successful request': (r) =>
            r.status === 201 ||
            r.status === 200,

        'expected business rejection': (r) =>
            r.status === 400 ||
            r.status === 409 ||
            r.status === 201 ||
            r.status === 200,

        'no server error': (r) => r.status < 500,
    });
}