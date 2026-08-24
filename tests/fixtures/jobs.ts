import { extractedJobSchema, type ExtractedJob } from '@/types/job';

export function makeJob(overrides: Partial<ExtractedJob> = {}): ExtractedJob {
  return extractedJobSchema.parse({
    title: 'Senior Node.js Developer',
    company: 'Example Inc.',
    url: 'https://jobs.example.com/senior-node-developer',
    description:
      'We are looking for a Senior Node.js Developer to join our remote team.\n' +
      'Requirements:\n' +
      '• 5+ years of experience with Node.js\n' +
      '• Strong experience with TypeScript (must have)\n' +
      '• Experience with Docker is required\n' +
      '• Vue or React knowledge\n' +
      '• AWS is a plus\n' +
      'Responsibilities:\n' +
      '• Build REST APIs\n' +
      '• Review code and mentor developers\n' +
      'What we offer:\n' +
      '• $3,000 - $4,000 per month\n' +
      '• Fully remote work\n' +
      'English B2 is required.',
    requirements: [
      '5+ years of experience with Node.js',
      'Strong experience with TypeScript (must have)',
      'Experience with Docker is required',
      'Vue or React knowledge',
      'AWS is a plus',
    ],
    responsibilities: ['Build REST APIs', 'Review code and mentor developers'],
    salary: {
      min: 3000,
      max: 4000,
      currency: 'USD',
      period: 'month',
      raw: '$3,000 - $4,000 per month',
    },
    location: 'Remote',
    workMode: 'remote',
    seniority: 'senior',
    employmentType: 'full_time',
    technologies: ['Node.js', 'TypeScript', 'Docker', 'Vue', 'React', 'AWS', 'REST API'],
    languageRequirements: ['English B2'],
    source: 'test',
    extractionQuality: 0.9,
    ...overrides,
  });
}

export const JSON_LD_PAGE = `<!doctype html>
<html><head>
<title>Senior Node.js Developer at Example Inc.</title>
<meta property="og:title" content="Senior Node.js Developer at Example Inc." />
<meta property="og:description" content="Remote Node.js role" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Senior Node.js Developer",
  "datePosted": "2026-01-15",
  "employmentType": "FULL_TIME",
  "jobLocationType": "TELECOMMUTE",
  "hiringOrganization": { "@type": "Organization", "name": "Example Inc.", "url": "https://example.com" },
  "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": "Krakow", "addressCountry": "Poland" } },
  "baseSalary": { "@type": "MonetaryAmount", "currency": "USD", "value": { "@type": "QuantitativeValue", "minValue": 3000, "maxValue": 4000, "unitText": "MONTH" } },
  "description": "<p>We need a senior engineer.</p><h3>Requirements</h3><ul><li>5+ years of Node.js</li><li>TypeScript is a must have</li><li>Docker required</li></ul><h3>Responsibilities</h3><ul><li>Build REST APIs</li><li>Mentor juniors</li></ul>"
}
</script>
</head>
<body><h1>Senior Node.js Developer</h1></body></html>`;

export const DOM_ONLY_PAGE = `<!doctype html>
<html><head><title>Vue Developer — Acme GmbH</title></head>
<body>
  <main>
    <h1 class="job-title">Middle Vue Developer</h1>
    <span class="company-name">Acme GmbH</span>
    <span class="job-location">Berlin, Germany</span>
    <div class="salary">€ 4,500 - € 5,500 per month</div>
    <div class="job-description">
      <p>Acme is hiring a Vue developer for a hybrid role in Berlin.</p>
      <h3>Requirements</h3>
      <ul>
        <li>3+ years of experience with Vue</li>
        <li>Good knowledge of TypeScript and Vite</li>
        <li>Experience with REST APIs</li>
        <li>German B1 is nice to have</li>
      </ul>
      <h3>Responsibilities</h3>
      <ul><li>Develop new features</li><li>Work with designers</li></ul>
      <h3>What we offer</h3>
      <ul><li>Hybrid work</li><li>Training budget</li></ul>
    </div>
  </main>
</body></html>`;
