// The people in the demo data, in one place: the seeder creates them, docs/DEMO.md and
// docs/demo-accounts.xlsx are written from this table (`pnpm --filter @wusool/api demo:sheet`).
//
// Addresses are short and say who they are, because they are typed by hand on a phone during a
// demonstration. The domain is `t.test` — `.test` can never be delivered anywhere (RFC 6761), so
// a password-reset code for a demo account cannot reach a real person's inbox.
import type { SignupRole } from '@wusool/shared';

/** One password for every demo account: these are for showing the system, never for real data. */
export const DEMO_PASSWORD = '123456';
export const DEMO_DOMAIN = 't.test';

export interface DemoPerson {
  /** Local part of the address: the whole address is `${local}@${DEMO_DOMAIN}`. */
  local: string;
  nameAr: string;
  nameEn: string;
  /** What this person is, in the words the app uses. */
  role: string;
  roleEn: string;
  /** What has been set up for them, so a tester knows what to look for. */
  scenario: string;
  scenarioEn: string;
  signupRole: SignupRole;
}

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  {
    local: 'parent1',
    nameAr: 'نورة القطان',
    nameEn: 'Noora Alqattan',
    role: 'ولي أمر',
    roleEn: 'Guardian',
    scenario: 'اليوم الطبيعي: أخوان على نفس الرقم صعدا ونزلا، وطفل ثالث غائب اليوم.',
    scenarioEn:
      'An ordinary day: two siblings on one phone number boarded and got off, a third is absent.',
    signupRole: 'guardian',
  },
  {
    local: 'parent2',
    nameAr: 'هيا العلوي',
    nameEn: 'Haya Alalawi',
    role: 'ولي أمر',
    roleEn: 'Guardian',
    scenario: 'طلب الانضمام للمدرسة ما زال بانتظار الموافقة.',
    scenarioEn: 'The link request to the school is still waiting for approval.',
    signupRole: 'guardian',
  },
  {
    local: 'parent3',
    nameAr: 'مريم الشاعر',
    nameEn: 'Maryam Alshaer',
    role: 'ولي أمر',
    roleEn: 'Guardian',
    scenario: 'رحلة جارية الآن: الطفل على متن الحافلة والحالة تتغيّر أمامك.',
    scenarioEn: 'A trip running right now: the child is on board and the state changes live.',
    signupRole: 'guardian',
  },
  {
    local: 'parent4',
    nameAr: 'دانة المحمود',
    nameEn: 'Dana Almahmood',
    role: 'ولي أمر',
    roleEn: 'Guardian',
    scenario: 'التنبيه الحرج: انتهت رحلة الأمس والطفل ما زال مسجّلاً على الحافلة.',
    scenarioEn:
      "The critical alert: yesterday's trip ended with the child still recorded on board.",
    signupRole: 'guardian',
  },
  {
    local: 'parent5',
    nameAr: 'شيخة الجودر',
    nameEn: 'Shaikha Aljowder',
    role: 'ولي أمر',
    roleEn: 'Guardian',
    scenario: 'طفل مع سائق مستقل بدل مدرسة: الربط تمّ برقم جوال السائق.',
    scenarioEn:
      "A child with an independent driver instead of a school, linked by the driver's number.",
    signupRole: 'guardian',
  },
  {
    local: 'parent6',
    nameAr: 'فاطمة الشيراوي',
    nameEn: 'Fatima Alshirawi',
    role: 'ولي أمر',
    roleEn: 'Guardian',
    scenario: 'أضافت سائقها بنفسها وهو غير مسجّل: الدعوة معلّقة في صفحة الطفل.',
    scenarioEn:
      'Added her own driver, who has no account yet: the invitation is waiting on the child page.',
    signupRole: 'guardian',
  },
  {
    local: 'driver1',
    nameAr: 'جاسم الدوسري',
    nameEn: 'Jassim Aldosari',
    role: 'سائق مدرسة',
    roleEn: 'School driver',
    scenario: 'رحلة الصباح انتهت بسلام، ورحلة العودة تبدأ بعد قليل.',
    scenarioEn: 'The morning run finished safely; the trip home starts shortly.',
    signupRole: 'staff_driver',
  },
  {
    local: 'driver2',
    nameAr: 'سلمان النعيمي',
    nameEn: 'Salman Alnaimi',
    role: 'سائق مدرسة',
    roleEn: 'School driver',
    scenario: 'رحلة جارية الآن: طالب على متن الحافلة — جرّب «إنهاء الرحلة» وشاهد الرفض الأحمر.',
    scenarioEn:
      'A trip running now with a student on board — press "end trip" and watch the red refusal.',
    signupRole: 'staff_driver',
  },
  {
    local: 'driver3',
    nameAr: 'عيسى البنعلي',
    nameEn: 'Isa Albinali',
    role: 'سائق بانتظار إدارته',
    roleEn: 'Driver waiting for a school',
    scenario: 'أنشأ حسابه وينتظر أن تضيفه المدرسة: تظهر له شاشة الانتظار.',
    scenarioEn: 'Signed up and is waiting for a school to add them: the waiting screen.',
    signupRole: 'staff_driver',
  },
  {
    local: 'driver4',
    nameAr: 'خالد المناعي',
    nameEn: 'Khalid Almannai',
    role: 'سائق مستقل',
    roleEn: 'Independent driver',
    scenario: 'يدير مركبته ومساره بنفسه، والأهالي يربطون أطفالهم برقمه.',
    scenarioEn: 'Runs their own vehicle and route; families link their children by their number.',
    signupRole: 'independent_driver',
  },
  {
    local: 'school',
    nameAr: 'منى الحداد',
    nameEn: 'Mona Alhaddad',
    role: 'مديرة مدرسة',
    roleEn: 'School admin',
    scenario: 'مدرسة كاملة: ثلاث حافلات ومسارات وطلاب، طلب انضمام معلّق، وتنبيه حرج مفتوح.',
    scenarioEn:
      'A complete school: three buses, routes and students, a pending request, an open critical alert.',
    signupRole: 'organization',
  },
  {
    local: 'kg',
    nameAr: 'أمل السعد',
    nameEn: 'Amal Alsaad',
    role: 'مديرة روضة',
    roleEn: 'Kindergarten admin',
    scenario: 'سجّلت روضة وتنتظر موافقة مشغّل المنصة: تظهر لها لافتة الانتظار.',
    scenarioEn: 'Registered a kindergarten and is waiting for the operator: the waiting banner.',
    signupRole: 'organization',
  },
  {
    local: 'admin',
    nameAr: 'مشغّل المنصة',
    nameEn: 'Platform Operator',
    role: 'مشغّل المنصة',
    roleEn: 'Platform operator',
    scenario: 'يوافق على المدارس والرياض الجديدة: عنده روضة بانتظار الموافقة.',
    scenarioEn: 'Approves new schools and kindergartens: one kindergarten is waiting.',
    signupRole: 'organization',
  },
];

export const emailOf = (local: string) => `${local}@${DEMO_DOMAIN}`;

export function demoPerson(local: string): DemoPerson {
  const person = DEMO_PEOPLE.find((p) => p.local === local);
  if (!person) throw new Error(`no demo person "${local}"`);
  return person;
}
