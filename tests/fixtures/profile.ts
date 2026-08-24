import { userProfileSchema, type UserProfile } from '@/types/profile';

/** A realistic fullstack profile used across the unit tests. */
export function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  const now = 1_700_000_000_000;
  return userProfileSchema.parse({
    id: 'primary',
    version: 3,
    createdAt: now,
    updatedAt: now,
    onboardingCompleted: true,
    personal: {
      firstName: 'Alex',
      lastName: 'Doe',
      email: 'alex@example.com',
      phone: '+1 555 0100',
    },
    professional: {
      currentPosition: 'Fullstack Developer',
      desiredPosition: 'Senior Fullstack Developer',
      seniority: 'senior',
      experienceYears: 5,
      summary: 'Fullstack engineer working with Vue and Node.js.',
    },
    location: { country: 'Poland', city: 'Krakow', willingToRelocate: false },
    links: { github: 'https://github.com/alex', linkedin: 'https://linkedin.com/in/alex' },
    salary: { currency: 'USD', period: 'month', current: 3000, expected: 3500 },
    preferences: { employmentTypes: ['full_time'], workModes: ['remote', 'hybrid'] },
    skills: [
      { name: 'JavaScript', category: 'frontend', primary: true },
      { name: 'TypeScript', category: 'frontend', primary: true },
      { name: 'Vue', category: 'frontend', primary: true },
      { name: 'React', category: 'frontend', primary: false },
      { name: 'Node.js', category: 'backend', primary: true },
      { name: 'NestJS', category: 'backend', primary: false },
      { name: 'PostgreSQL', category: 'database', primary: false },
      { name: 'Redis', category: 'database', primary: false },
      { name: 'Docker', category: 'devops', primary: false },
      { name: 'Git', category: 'other', primary: false },
      { name: 'REST API', category: 'other', primary: false },
    ],
    languages: [
      { code: 'en', name: 'English', level: 'c1' },
      { code: 'pl', name: 'Polish', level: 'native' },
    ],
    experience: [
      {
        id: 'exp1',
        company: 'Example Inc.',
        position: 'Fullstack Developer',
        startDate: '2020-01',
        endDate: '',
        current: true,
        description: 'Built internal tooling.',
        technologies: ['Vue', 'Node.js', 'PostgreSQL'],
      },
    ],
    ...overrides,
  });
}
