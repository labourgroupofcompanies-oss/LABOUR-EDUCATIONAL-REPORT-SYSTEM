/**
 * OpenApiService
 * Provides OpenAPI 3.0 specification parser, dynamic schema viewer, 
 * and synchronized multi-language code generators (JS, Node, Python, PHP, cURL).
 */

export const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Labour Educational Report System Platform API',
    version: '1.2.0',
    description: 'Enterprise REST API for school management, Ghana NaCCA score entries, report card generation, learner records, and financial accounting.',
    contact: {
      name: 'Platform Engineering Team',
      email: 'api-support@laboureducational.edu.gh'
    }
  },
  servers: [
    { url: 'https://api.laboureducational.edu.gh/v1', description: 'Production API Gateway' },
    { url: 'https://sandbox-api.laboureducational.edu.gh/v1', description: 'Sandbox Testing Gateway' }
  ],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Format: pk_live_... or pk_test_...'
      }
    },
    schemas: {
      School: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'sch_99381a7b-23b0-4f38' },
          name: { type: 'string', example: 'Accra Metropolitan Basic School' },
          circuit: { type: 'string', example: 'Osu Klottey Circuit A' },
          district: { type: 'string', example: 'Accra Metro District' },
          region: { type: 'string', example: 'Greater Accra Region' },
          headteacher_name: { type: 'string', example: 'Dr. Kwame Mensah' },
          academic_year: { type: 'string', example: '2025/2026' },
          current_term: { type: 'integer', example: 2 }
        }
      },
      Learner: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          school_id: { type: 'string', format: 'uuid' },
          first_name: { type: 'string', example: 'Kofi' },
          last_name: { type: 'string', example: 'Appiah' },
          gender: { type: 'string', enum: ['Male', 'Female'], example: 'Male' },
          dob: { type: 'string', format: 'date', example: '2014-05-12' },
          class_name: { type: 'string', example: 'Basic 6' },
          enrollment_code: { type: 'string', example: 'LRN-2026-094' },
          guardian_name: { type: 'string', example: 'Grace Appiah' },
          guardian_phone: { type: 'string', example: '+233244000111' }
        }
      },
      Teacher: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          staff_id: { type: 'string', example: 'TCH-0849' },
          full_name: { type: 'string', example: 'Emmanuel Osei' },
          email: { type: 'string', format: 'email', example: 'e.osei@school.edu.gh' },
          assigned_class: { type: 'string', example: 'Basic 6B' },
          is_class_teacher: { type: 'boolean', example: true }
        }
      },
      Subject: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'sub_math' },
          name: { type: 'string', example: 'Mathematics' },
          code: { type: 'string', example: 'MATH-B6' },
          category: { type: 'string', example: 'Core' }
        }
      },
      Class: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'cls_b6a' },
          name: { type: 'string', example: 'Basic 6A' },
          stage: { type: 'string', example: 'Primary' },
          capacity: { type: 'integer', example: 45 }
        }
      },
      Attendance: {
        type: 'object',
        properties: {
          learner_id: { type: 'string', format: 'uuid' },
          term: { type: 'integer', example: 2 },
          academic_year: { type: 'string', example: '2025/2026' },
          days_opened: { type: 'integer', example: 60 },
          days_present: { type: 'integer', example: 58 },
          days_absent: { type: 'integer', example: 2 }
        }
      },
      Score: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          learner_id: { type: 'string', format: 'uuid' },
          subject_name: { type: 'string', example: 'English Language' },
          class_score: { type: 'number', example: 38.5, description: 'Class Assessment (50% max)' },
          exam_score: { type: 'number', example: 44.0, description: 'Exam Assessment (50% max)' },
          total_score: { type: 'number', example: 82.5 },
          grade: { type: 'string', example: 'A' },
          remarks: { type: 'string', example: 'Excellent Performance' }
        }
      },
      ReportCard: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          learner_id: { type: 'string', format: 'uuid' },
          class_name: { type: 'string', example: 'Basic 6' },
          term: { type: 'integer', example: 2 },
          academic_year: { type: 'string', example: '2025/2026' },
          overall_total: { type: 'number', example: 642.5 },
          overall_average: { type: 'number', example: 80.31 },
          position_in_class: { type: 'string', example: '1st out of 42' },
          conduct: { type: 'string', example: 'Respectful and hardworking' },
          class_teacher_remarks: { type: 'string', example: 'Keep up the brilliant performance!' }
        }
      },
      FinancialRecord: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          learner_id: { type: 'string', format: 'uuid' },
          amount_paid: { type: 'number', example: 350.00 },
          balance_due: { type: 'number', example: 50.00 },
          payment_date: { type: 'string', format: 'date', example: '2026-03-14' },
          receipt_number: { type: 'string', example: 'RCP-883921' },
          payment_method: { type: 'string', example: 'Mobile Money' }
        }
      }
    }
  },
  paths: {
    '/schools': {
      get: {
        summary: 'List Registered Schools',
        description: 'Fetch paginated list of schools registered under the platform.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'district', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Successful response' },
          '401': { description: 'Unauthorized or invalid API Key' },
          '429': { description: 'Rate limit exceeded' }
        }
      }
    },
    '/learners': {
      get: {
        summary: 'List Learners Directory',
        description: 'Fetch list of enrolled learners with class and guardian records.',
        parameters: [
          { name: 'school_id', in: 'query', schema: { type: 'string' } },
          { name: 'class_name', in: 'query', schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Learner directory returned' } }
      },
      post: {
        summary: 'Enroll New Learner',
        description: 'Add a new learner profile to a school roster.',
        responses: { '201': { description: 'Learner created successfully' } }
      }
    },
    '/scores': {
      get: {
        summary: 'Fetch Academic Scores',
        description: 'Retrieve NaCCA CA & Exam scores for learners by class and term.',
        responses: { '200': { description: 'Academic scores list' } }
      },
      post: {
        summary: 'Submit Subject Scores',
        description: 'Bulk upload or update subject marks for a class.',
        responses: { '200': { description: 'Scores batch recorded' } }
      }
    },
    '/reports/generate': {
      post: {
        summary: 'Generate Terminal Report Cards',
        description: 'Trigger PDF and digital terminal report calculations for a class.',
        responses: { '200': { description: 'Report card generation queued' } }
      }
    },
    '/financials/payments': {
      get: {
        summary: 'Fetch Fee Payments',
        description: 'Retrieve fee statements, receipts, and balances.',
        responses: { '200': { description: 'Payment records' } }
      }
    }
  }
};

/**
 * Generate code snippets for selected endpoint and language
 */
export const generateCodeSnippet = (method, endpoint, language, apiKey = 'pk_live_sample_key_9932817283') => {
  const fullUrl = `https://api.laboureducational.edu.gh/v1${endpoint}`;
  const upperMethod = method.toUpperCase();

  switch (language.toLowerCase()) {
    case 'javascript':
    case 'js':
      return `// JavaScript (Fetch API)
const options = {
  method: '${upperMethod}',
  headers: {
    'X-API-Key': '${apiKey}',
    'Content-Type': 'application/json'
  }${upperMethod !== 'GET' ? `,\n  body: JSON.stringify({\n    school_id: "sch_99381a7b",\n    term: 2\n  })` : ''}
};

fetch('${fullUrl}', options)
  .then(res => res.json())
  .then(data => console.log('Data:', data))
  .catch(err => console.error('Error:', err));`;

    case 'node':
    case 'node.js':
      return `// Node.js (Axios)
const axios = require('axios');

async function executeRequest() {
  try {
    const response = await axios({
      method: '${upperMethod}',
      url: '${fullUrl}',
      headers: {
        'X-API-Key': '${apiKey}',
        'Content-Type': 'application/json'
      }${upperMethod !== 'GET' ? `,\n      data: {\n        school_id: "sch_99381a7b",\n        term: 2\n      }` : ''}
    });
    console.log('Response Status:', response.status);
    console.log('Data:', response.data);
  } catch (error) {
    console.error('API Request Failed:', error.response?.data || error.message);
  }
}

executeRequest();`;

    case 'python':
      return `# Python (requests)
import requests

url = "${fullUrl}"
headers = {
    "X-API-Key": "${apiKey}",
    "Content-Type": "application/json"
}
${upperMethod !== 'GET' ? 'payload = {\n    "school_id": "sch_99381a7b",\n    "term": 2\n}\n' : ''}
response = requests.request("${upperMethod}", url, headers=headers${upperMethod !== 'GET' ? ', json=payload' : ''})

print("Status Code:", response.status_code)
print("Response JSON:", response.json())`;

    case 'php':
      return `<?php
// PHP (cURL)
$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => "${fullUrl}",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST => "${upperMethod}",
  CURLOPT_HTTPHEADER => array(
    "X-API-Key: ${apiKey}",
    "Content-Type: application/json"
  ),
  ${upperMethod !== 'GET' ? `CURLOPT_POSTFIELDS => json_encode(array("school_id" => "sch_99381a7b", "term" => 2)),` : ''}
));

$response = curl_exec($curl);
$err = curl_error($curl);
curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}`;

    case 'curl':
    default:
      return `# cURL Terminal Example
curl -X ${upperMethod} "${fullUrl}" \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json"${upperMethod !== 'GET' ? ` \\\n  -d '{"school_id": "sch_99381a7b", "term": 2}'` : ''}`;
  }
};
