import { emptyApplication, sanitizeApplication } from '../../shared/schema.js';
export const sample = () => sanitizeApplication({
  ...emptyApplication(),
  surname: 'ADEBAYO', givenName: 'Oluwaseun Michael', dob: '2001-03-14', placeOfBirth: 'Lagos, Nigeria',
  nationality: 'Nigerian', presentCountryCity: 'Nigeria / Lagos', passportNo: 'A12345678', passportExpiry: '2031-05-20',
  gender: 'Male', religion: 'Christianity', nativeLanguage: 'Yoruba', officialLanguage: 'English',
  consulateName: 'Chinese Consulate General in Lagos', consulateMailbox: 'consulate.lagos@example.org',
  maritalStatus: 'Single', highestEducation: 'Bachelor',
  present: { address: '12 Awolowo Road, Ikoyi, Lagos, Nigeria', tel: '+234 803 000 0000', email: 'seun@example.com', postCode: '101233' },
  permanent: { address: '4 Palm Avenue, Ibadan, Oyo, Nigeria', tel: '+234 802 111 1111', email: 'seun.home@example.com', postCode: '200001' },
  chineseProficiency: 'Good', hsk: 'HSK4', englishProficiency: 'Excellent', toefl: '100', ielts: '7.0',
  education: [
    { school: 'Lagos Primary School', from: '2007-09', to: '2013-07', major: 'General', degree: 'Primary Certificate' },
    { school: 'University of Lagos', from: '2019-09', to: '2023-07', major: 'Computer Science', degree: 'Bachelor' },
    { school: 'Federal Science College', from: '2013-09', to: '2019-06', major: 'Science', degree: 'WAEC' },
    { school: 'Extra Institute', from: '2023-09', to: '', major: 'Data', degree: 'Diploma' },
  ],
  work: [{ unit: 'TechCo Ltd', from: '2023-08', to: '2025-06', position: 'Developer', place: 'Lagos' }],
  study: {
    degreeType: 'Master', majors: 'Computer Science; Artificial Intelligence', teachingLanguage: 'English',
    durationFrom: '2027-09', durationTo: '2029-06', prefUniversity: 'yes', prefUniversityText: 'Tsinghua, Peking University',
    prefCity: 'notImportant', selfSupport: false, scholarship: true, fullScholarship: true, partialScholarship: false,
    otherScholarship: true, otherScholarshipText: 'CSC Silk Road', remedialFrom: '2026-09', remedialTo: '2027-06',
  },
  supporter: { name: 'Michael Adebayo', relationship: 'Father', email: 'dad@example.com', telephone: '+234 805 222 2222', address: '4 Palm Avenue, Ibadan, Nigeria' },
  emergency: { name: 'Li Wei', relationship: 'Friend', email: 'liwei@example.cn', telephone: '+86 138 0000 0000', address: 'Haidian District, Beijing, China' },
  family: {
    father: { name: 'Michael Adebayo', age: '58', jobTitle: 'Engineer', workPlace: 'Ibadan', phone: '+234 805 222 2222', email: 'dad@example.com' },
    mother: { name: 'Grace Adebayo', age: '55', jobTitle: 'Teacher', workPlace: 'Ibadan', phone: '+234 806 333 3333', email: 'mum@example.com' },
    spouse: {},
  },
  declaration: true,
});
