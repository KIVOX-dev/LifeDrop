export const FAQS: { q: string; a: string }[] = [
  { q: 'Who can register as a donor?', a: 'Anyone aged 18 or over who wants to be notified about blood requirements can register. Registering does not mean you are medically eligible to donate — qualified medical staff decide that every time.' },
  { q: 'How do I earn reward points?', a: 'After you donate, upload your donation certificate (PDF, JPG or PNG up to 5 MB). Once an administrator verifies it you receive exactly 100 points. No points are given while a certificate is pending or if it is rejected.' },
  { q: 'Why was my certificate rejected?', a: 'The reason is shown in your dashboard and emailed to you — usually an unreadable image or missing details. You can upload a corrected certificate for the same donation date.' },
  { q: 'Does LifeDrop tell me when I can donate again?', a: 'No. About three months after a verified donation we send a friendly reminder to check your eligibility with your blood bank or doctor. It is a reminder, not a medical decision.' },
  { q: 'Is my blood group enough to know if I can help a patient?', a: 'No. Blood group matching is only used to decide which donors are notified. Compatibility and eligibility are always decided by the hospital or blood bank.' },
  { q: 'Who can see my personal information?', a: 'Only you and authorised administrators. On the public leaderboard you can choose to appear as “Anonymous donor”. Certificates are stored privately and only opened through short-lived secure links.' },
  { q: 'How do I stop receiving blood requirement emails?', a: 'Use the unsubscribe link in any email or switch off alerts in Profile → Notifications. Important account and security emails will still be sent.' },
  { q: 'How do I delete my account?', a: 'Open Profile → Privacy and send a deletion request. An administrator will erase your personal data and stored certificates.' },
];

export const STEPS = [
  { title: 'Register', text: 'Create your free donor account, verify your email and choose your notification preferences.' },
  { title: 'Respond to a requirement', text: 'Browse verified requirements from hospitals and blood banks, or wait for an alert that matches your blood group.' },
  { title: 'Donate at the hospital', text: 'Medical staff check your eligibility and collect the donation. Always follow their guidance.' },
  { title: 'Upload your certificate', text: 'Upload the certificate you received. An administrator verifies it and credits 100 points.' },
];

/** Illustrative copy: replace with real, consented donor stories before launch. */
export const TESTIMONIALS = [
  { name: 'Asha', role: 'Regular donor', text: 'The alert reached me within minutes and the hospital details were clear. Uploading my certificate afterwards took seconds.' },
  { name: 'Rahul', role: 'First-time donor', text: 'I liked that nothing pretended to be medical advice. The reminder simply told me to check with my doctor.' },
  { name: 'Dr. Meera', role: 'Blood bank coordinator', text: 'Publishing a requirement and seeing delivery status per donor saves our team a lot of phone calls.' },
];

export const PRIVACY_SECTIONS: [string, string][] = [
  ['Information we collect', 'Account details (name, email, phone, date of birth, address, blood group), optional emergency contact and profile picture, donation records and the certificates you upload, and technical logs needed to keep the service secure.'],
  ['How we use it', 'To run your donor account, notify you about relevant blood requirements, verify donation certificates, award points, send service emails and keep an audit trail for administrators.'],
  ['Medical information', 'We store your self-reported blood group and your donation certificates. We do not make medical eligibility or compatibility decisions; qualified medical staff do.'],
  ['Certificates and storage', 'Certificates are stored in a private bucket with unguessable names and are only opened through short-lived signed links by you or an authorised administrator.'],
  ['Sharing', 'Requirement alerts never reveal your details to recipients. The public leaderboard shows your name only if you allow it. We use trusted processors for email delivery (Brevo) and file storage (Backblaze B2). We do not sell personal data.'],
  ['Your choices', 'You can hide yourself from the leaderboard, switch off non-essential emails, toggle availability, export your data and request deletion at any time from your dashboard.'],
  ['Retention and deletion', 'When an administrator fulfils a deletion request, your profile and stored certificates are erased and your account is anonymised. Anonymous aggregate statistics may remain.'],
  ['Security', 'Passwords are hashed, sessions use short-lived tokens with rotation, access is role-based and administrator actions are logged.'],
  ['Contact', 'Questions or requests? Use the Contact page and we will respond promptly.'],
];

export const TERMS_SECTIONS: [string, string][] = [
  ['Using LifeDrop', 'LifeDrop is a platform that connects volunteer blood donors with blood requirements published by administrators. You must be 18 or older and provide accurate information.'],
  ['No medical advice', 'Nothing on LifeDrop is medical advice. Eligibility to donate and compatibility with a recipient are decided only by qualified medical personnel at the hospital or blood bank.'],
  ['Certificates and points', 'Only genuine donation certificates may be uploaded. Approved certificates earn 100 points each; pending or rejected certificates earn none. Fraudulent submissions lead to point reversal and account suspension.'],
  ['Voluntary donation', 'Blood donation is voluntary and unpaid. Points are recognition only and have no cash value.'],
  ['Accounts', 'Keep your password confidential. We may deactivate accounts that misuse the platform.'],
  ['Availability', 'We aim for reliable service but cannot guarantee that every requirement will be fulfilled or every email delivered in time. In an emergency always contact the hospital directly.'],
  ['Changes', 'We may update these terms; continued use means you accept the updated terms.'],
];
