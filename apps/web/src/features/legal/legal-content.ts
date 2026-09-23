// The privacy policy and terms shown at /privacy and /terms and linked from the stores.
// They describe exactly what the code does; change them together with the behaviour.
//
// NOT REVIEWED BY A LAWYER. Before the first real school uses Tammeni, a lawyer in the country
// of operation must read both documents (children's data, Bahrain's Personal Data Protection
// Law 30/2018, and the transfer of data to the server in Germany).

export interface LegalSection {
  heading: string;
  /** Paragraphs; a line starting with "- " is shown as a list item. */
  body: string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
}

/** Filled into both documents so there is one place to change them. */
export const LEGAL = {
  // TODO(owner): put the full legal name exactly as it will appear in the App Store and Play
  // Console. Apple shows the developer's real name on the store page.
  /** The person or company responsible for the service. */
  operator: '[الاسم الكامل لمالك التطبيق]',
  operatorEn: '[Full legal name of the app owner]',
  contactEmail: 'support.tammeni@gmail.com',
  version: '2026-09-23',
  serverCountry: { ar: 'ألمانيا (فرانكفورت)', en: 'Germany (Frankfurt)' },
} as const;

export const PRIVACY_AR: LegalDocument = {
  title: 'سياسة الخصوصية',
  updated: LEGAL.version,
  intro: [
    'طمّني خدمة لسلامة الطلاب في النقل المدرسي: السائق يسجّل صعود كل طالب ونزوله بضغطة، ويصل ولي الأمر إشعار فوري، وينبّه النظام إذا انتهت رحلة وفيها طالب لم يُسجَّل نزوله.',
    `المسؤول عن البيانات: ${LEGAL.operator}. للتواصل في أي أمر يخص خصوصيتك: ${LEGAL.contactEmail}.`,
    'هذه السياسة تشرح بالضبط ما نجمعه ولماذا، ومن يراه، وكم يبقى، وكيف تحذفه.',
  ],
  sections: [
    {
      heading: 'البيانات التي نجمعها',
      body: [
        'من صاحب الحساب (ولي أمر، سائق، مدير مدرسة أو شركة نقل):',
        '- الاسم بالعربي والإنجليزي، والبريد الإلكتروني، ورقم الجوال.',
        '- كلمة المرور لا تُخزَّن أبداً كما هي، بل تُخزَّن بصيغة مشفّرة لا يمكن إرجاعها.',
        '- لغة الواجهة، وإعدادات الإشعارات، ورمز التحقق بخطوتين إن فعّلته (مشفّراً).',
        '- معرّف جهازك للإشعارات، ونوع المتصفح أو الجهاز.',
        'عن الطالب، ويُدخلها وليّ أمره:',
        '- الاسم، وتاريخ الميلاد، واسم المدرسة، وملاحظات اختيارية.',
        '- صورة وجه واضحة: الغرض الوحيد منها أن يتعرّف السائق على الطالب.',
        'من تشغيل الرحلات:',
        '- كل تسجيل صعود أو نزول أو غياب: مَن سجّله ومتى (بتوقيت جهازه وتوقيت الخادم).',
        '- موقع الجهاز **لحظة الضغط فقط**، إن سمح السائق بذلك. لا يوجد تتبّع مستمر للموقع، ولا نعرف أين الحافلة بين ضغطة وأخرى.',
        '- سجل التنبيهات: متى فُتح التنبيه، ومن اطّلع عليه، وكيف أُغلق وبأي سبب.',
        '- سجل تدقيق للعمليات الحساسة (مثل قبول طالب، أو إنهاء رحلة قسرياً، أو عرض قائمة الطلاب بالصور).',
      ],
    },
    {
      heading: 'لماذا نجمعها، وعلى أي أساس',
      body: [
        'كل ما نجمعه غرضه واحد: ألا يُنسى طفل، وأن يعرف وليّ الأمر أين وصل طفله.',
        '- بيانات الطالب وصورته: بموافقة وليّ الأمر الصريحة عند إضافة الطالب، ويمكن سحبها في أي وقت.',
        '- بيانات الحساب: لتنفيذ الخدمة التي طلبتها (تسجيل الدخول، الإشعارات، التواصل عند الطوارئ).',
        '- سجلات الرحلات والتنبيهات والتدقيق: لحماية الأطفال، وللرجوع إليها عند التحقيق في حادثة.',
        'لا نبيع بياناتك، ولا نستخدمها في إعلانات، ولا نشاركها مع أي جهة تسويقية.',
      ],
    },
    {
      heading: 'من يرى ماذا',
      body: [
        '- **وليّ الأمر**: بيانات أطفاله فقط، ورحلاتهم وتنبيهاتهم.',
        '- **المدرسة أو شركة النقل**: بيانات الطلاب المرتبطين بها فقط. قبل قبول الطلب ترى الاسم والمدرسة فقط؛ الصورة وتاريخ الميلاد لا تظهر إلا بعد القبول.',
        '- **السائق**: قائمة طلاب رحلته فقط، بالاسم والصورة، ليتعرّف عليهم.',
        '- **مشغّل المنصة**: يوافق على تسجيل المدارس وشركات النقل، ولا يستخدم بيانات الأطفال لأي غرض آخر.',
        'النظام يمنع تقنياً وصول أي مؤسسة إلى بيانات طلاب مؤسسة أخرى.',
      ],
    },
    {
      heading: 'أين تُخزَّن البيانات',
      body: [
        `تُخزَّن البيانات حالياً على خادم في ${LEGAL.serverCountry.ar}، وتُنقل مشفّرة بالكامل (HTTPS).`,
        'النسخ الاحتياطية مشفّرة أيضاً، ولا يمكن فتحها بدون مفتاح يُحفظ منفصلاً.',
        'إذا اشترط قانون بلدك بقاء البيانات داخله، سنُعلمك قبل أي تشغيل رسمي وننقل البيانات إلى خادم داخل البلد.',
      ],
    },
    {
      heading: 'كم تبقى البيانات',
      body: [
        '- سجلات الرحلات: سنتان.',
        '- التنبيهات وسجل التدقيق: ثلاث سنوات (لا تقل عن سنة في كل الأحوال).',
        '- الإشعارات المرسلة: سنة. رموز البريد: أسبوع. جلسات الدخول: 30 يوماً.',
        'أي تنبيه مفتوح لا يُحذف أبداً قبل إغلاقه. المؤسسة تستطيع تمديد المدد، ولا تستطيع تقصيرها إلى أقل من سنة، لأن سجلات السلامة قد تكون دليلاً.',
      ],
    },
    {
      heading: 'حقوقك',
      body: [
        '- **الاطّلاع والنسخ**: زر «تصدير بيانات الطفل» يعطيك ملفاً بكل ما نحفظه عن طفلك، بما فيه صورته.',
        '- **التصحيح**: تعديل الاسم أو الرقم أو الصورة من داخل التطبيق.',
        '- **الحذف**: زر «حذف بيانات الطفل» يحذف الاسم والصورة ويفك الارتباط بكل الجهات. تبقى سجلات الرحلات والتنبيهات **بدون اسم أو صورة** لأنها سجلات سلامة.',
        '- **حذف الحساب**: من الإعدادات، ويحذف بياناتك الشخصية وصور الأطفال الذين لا وليّ أمر آخر لهم.',
        '- **سحب الموافقة**: في أي وقت، وتتوقف الخدمة عن الطفل المعني.',
        '- **الشكوى**: تستطيع التواصل معنا أولاً، ثم اللجوء إلى هيئة حماية البيانات الشخصية في البحرين إذا لم تقتنع بردّنا.',
      ],
    },
    {
      heading: 'الأطفال',
      body: [
        'التطبيق ليس موجّهاً للأطفال ولا يُنشئ لهم حسابات. بيانات الطفل يدخلها وليّ أمره، وهو صاحب القرار فيها.',
        'لا نعرض إعلانات، ولا نجمع أي بيانات من الأطفال أنفسهم.',
      ],
    },
    {
      heading: 'الأمان',
      body: [
        '- الاتصال مشفّر بالكامل، وكلمات المرور مخزّنة بصيغة لا يمكن إرجاعها.',
        '- التحقق بخطوتين متاح لكل حساب، ويُنصح به لمديري المدارس.',
        '- سجلات الرحلات والتنبيهات «للإضافة فقط»: لا يمكن تعديلها أو محوها، والتصحيح يكون بإضافة سجل جديد.',
        '- كل عملية حساسة تُسجَّل مع اسم من نفّذها ووقتها.',
        'لا يوجد نظام آمن 100%. إذا حدث اختراق يمسّ بياناتك، سنبلغك وسنبلغ الجهة المختصة بأسرع ما يمكن.',
      ],
    },
    {
      heading: 'الإشعارات',
      body: [
        'الإشعارات تمرّ عبر خدمات Google (لأجهزة Android) وApple (لأجهزة iPhone)، ويصلها عنوان جهازك ونص الإشعار.',
        'لهذا نكتب في الإشعار أقل قدر ممكن من المعلومات: اسم الطفل الأول وحالة الصعود أو النزول.',
      ],
    },
    {
      heading: 'تغييرات على هذه السياسة',
      body: [
        'إذا تغيّرت طريقة تعاملنا مع البيانات، سنحدّث هذه الصفحة ونطلب موافقتك من جديد إذا كان التغيير جوهرياً.',
        `آخر تحديث: ${LEGAL.version}.`,
      ],
    },
  ],
};

export const TERMS_AR: LegalDocument = {
  title: 'شروط الاستخدام',
  updated: LEGAL.version,
  intro: [
    `باستخدامك تطبيق طمّني فإنك توافق على هذه الشروط. مزوّد الخدمة: ${LEGAL.operator} — ${LEGAL.contactEmail}.`,
  ],
  sections: [
    {
      heading: 'ما هي الخدمة',
      body: [
        'طمّني يسجّل صعود الطلاب ونزولهم بضغطة من السائق، ويُشعر أولياء الأمور، ويطلق تنبيهاً إذا انتهت رحلة وفيها طالب لم يُسجَّل نزوله، أو تأخرت الرحلة، أو انقطع جهاز السائق.',
        'الخدمة مجانية حالياً. إذا أضفنا اشتراكات مستقبلاً فستكون على المدارس وشركات النقل، وسنعلن عنها قبل تطبيقها.',
      ],
    },
    {
      heading: 'تنبيه مهم: الخدمة مساعِدة وليست بديلاً',
      body: [
        'طمّني أداة تساعد على تقليل الخطأ البشري، وليست ضماناً لسلامة الطفل ولا بديلاً عن مسؤولية السائق والمدرسة وولي الأمر.',
        'وصول الإشعارات يعتمد على أمور خارج سيطرتنا: تغطية الشبكة، وشحن الجهاز، وإعدادات الإشعارات، وخدمات Google وApple.',
        'في أي حالة طارئة اتصل بالطوارئ أولاً (999 في البحرين)، ولا تنتظر التطبيق.',
      ],
    },
    {
      heading: 'الحسابات',
      body: [
        'يجب أن تكون بالغاً لتنشئ حساباً. أنت مسؤول عن سرية كلمة مرورك وعن كل ما يحدث من حسابك.',
        'تُقرّ بأن البيانات التي تدخلها صحيحة، وأنك ولي أمر الطفل الذي تسجّله أو مخوّل بذلك.',
        'نحن نوافق على تسجيل المدارس وشركات النقل قبل ظهورها لأولياء الأمور، لمنع انتحال الصفة.',
      ],
    },
    {
      heading: 'الاستخدام المقبول',
      body: [
        '- لا تستخدم الخدمة لغير غرضها: سلامة نقل الطلاب.',
        '- لا تسجّل طفلاً لست ولي أمره ولا مخوّلاً عنه.',
        '- لا تحاول الوصول إلى بيانات طلاب أو مؤسسات أخرى، ولا اختبار ثغرات النظام بدون إذن كتابي منا.',
        '- لا ترفع صوراً أو أسماء لا تخصّ الطالب المسجَّل.',
        'يحق لنا إيقاف أي حساب يخالف ذلك، مع الاحتفاظ بسجلات السلامة.',
      ],
    },
    {
      heading: 'مسؤوليات المدرسة أو شركة النقل',
      body: [
        '- التأكد من أن السائقين المضافين يعملون لديها فعلاً.',
        '- متابعة التنبيهات والتصرف فوراً عند ظهور أي تنبيه حرج.',
        '- إغلاق التنبيه فقط بعد التأكد الفعلي من سلامة الطالب، لأن سبب الإغلاق يُسجَّل باسم من أغلقه.',
      ],
    },
    {
      heading: 'التوقف والانقطاع',
      body: [
        'قد تتوقف الخدمة مؤقتاً للصيانة أو لأسباب خارجة عن إرادتنا. نبذل جهداً معقولاً لإبقائها تعمل، ولا نضمن عملها بلا انقطاع.',
        'قد نغيّر مزايا التطبيق أو نوقف الخدمة كلياً، وسنشعر المستخدمين قبل ذلك بوقت كافٍ لتصدير بياناتهم.',
      ],
    },
    {
      heading: 'حدود المسؤولية',
      body: [
        'الخدمة مقدَّمة «كما هي» في حدود ما يسمح به القانون.',
        'لا نتحمل مسؤولية الأضرار الناتجة عن خطأ السائق أو المدرسة أو ولي الأمر، ولا عن انقطاع الشبكة أو الجهاز، ولا عن اعتماد المستخدم على التطبيق وحده بدلاً من التحقق المباشر.',
        'هذا البند لا يحدّ من أي مسؤولية لا يجيز القانون استبعادها.',
      ],
    },
    {
      heading: 'إنهاء الاستخدام',
      body: [
        'تستطيع حذف حسابك في أي وقت من الإعدادات. تبقى سجلات الرحلات والتنبيهات بدون اسم أو صورة، للمدة المذكورة في سياسة الخصوصية.',
      ],
    },
    {
      heading: 'القانون المطبَّق',
      body: [
        'تخضع هذه الشروط لقوانين مملكة البحرين، وتختص محاكمها بالنظر في أي نزاع.',
        `للتواصل: ${LEGAL.contactEmail}. آخر تحديث: ${LEGAL.version}.`,
      ],
    },
  ],
};

export const PRIVACY_EN: LegalDocument = {
  title: 'Privacy Policy',
  updated: LEGAL.version,
  intro: [
    'Tammeni is a student-safety service for school transport: the driver records each child boarding and getting off with one tap, the guardian is notified immediately, and the system raises an alarm if a trip ends with a child still recorded on board.',
    `Data controller: ${LEGAL.operatorEn}. For anything about your privacy: ${LEGAL.contactEmail}.`,
    'This policy states exactly what we collect and why, who can see it, how long it is kept, and how you delete it.',
  ],
  sections: [
    {
      heading: 'What we collect',
      body: [
        'From account holders (guardian, driver, school or transport company admin):',
        '- Name in Arabic and English, email address, phone number.',
        '- The password is never stored as typed; only an irreversible hash is kept.',
        '- Interface language, notification settings, and your two-step key if you enable it (encrypted).',
        '- Your device token for notifications, and the browser or device type.',
        'About a child, entered by their guardian:',
        '- Name, date of birth, school name, optional notes.',
        '- A clear face photo, used for one purpose only: so the driver recognises the child.',
        'From running trips:',
        '- Every boarding, alighting or absence: who recorded it and when (device time and server time).',
        "- The device's location **at the moment of the tap only**, if the driver allows it. There is no continuous tracking; we do not know where the bus is between taps.",
        '- Alert history: when an alert opened, who saw it, and how and why it was closed.',
        '- An audit trail of sensitive actions (approving a student, forcing a trip to end, viewing the student list with photos).',
      ],
    },
    {
      heading: 'Why we collect it',
      body: [
        'Everything serves one purpose: that no child is forgotten, and that a guardian knows their child arrived.',
        "- A child's data and photo: on the guardian's explicit consent when adding the child, withdrawable at any time.",
        '- Account data: to provide the service you asked for (sign-in, notifications, emergency contact).',
        '- Trip, alert and audit records: to protect children and to have evidence if an incident is investigated.',
        'We do not sell your data, do not use it for advertising, and do not share it with marketers.',
      ],
    },
    {
      heading: 'Who sees what',
      body: [
        '- **Guardian**: only their own children, their trips and alerts.',
        '- **School or transport company**: only students linked to it. Before approving a request they see the name and school only; the photo and date of birth appear after approval.',
        '- **Driver**: only the children on their own trip, by name and photo, to recognise them.',
        '- **Platform operator**: approves schools and companies, and uses no child data for anything else.',
        "The system technically prevents any organisation from reaching another organisation's students.",
      ],
    },
    {
      heading: 'Where data is stored',
      body: [
        `Data is currently stored on a server in ${LEGAL.serverCountry.en} and travels fully encrypted (HTTPS).`,
        'Backups are encrypted as well and cannot be opened without a key kept separately.',
        "If your country's law requires data to stay inside it, we will tell you before any official use and move the data to a server in that country.",
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        '- Trip records: two years.',
        '- Alerts and the audit trail: three years (never less than one year).',
        '- Sent notifications: one year. Email codes: one week. Sign-in sessions: 30 days.',
        'An open alert is never deleted before it is closed. An organisation may keep records longer, but never shorter than a year, because safety records may be evidence.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        '- **Access and a copy**: "Export child data" gives you a file with everything we hold about your child, photo included.',
        '- **Correction**: change the name, number or photo inside the app.',
        '- **Deletion**: "Delete child data" removes the name and photo and unlinks every organisation. Trip and alert records remain **without a name or photo**, because they are safety records.',
        '- **Account deletion**: in Settings; it deletes your personal data and photos of children with no other guardian.',
        '- **Withdraw consent**: at any time; the service then stops for that child.',
        '- **Complain**: contact us first, then the Personal Data Protection Authority in Bahrain if our answer does not satisfy you.',
      ],
    },
    {
      heading: 'Children',
      body: [
        "The app is not directed at children and creates no accounts for them. A child's data is entered by their guardian, who decides about it.",
        'We show no advertising and collect nothing from children themselves.',
      ],
    },
    {
      heading: 'Security',
      body: [
        '- All traffic is encrypted and passwords are stored in an irreversible form.',
        '- Two-step sign-in is available for every account and recommended for school admins.',
        '- Trip and alert records are append-only: they cannot be edited or erased; a correction is a new record.',
        '- Every sensitive action is logged with who did it and when.',
        'No system is perfectly safe. If a breach affects your data we will tell you and the authority as fast as we can.',
      ],
    },
    {
      heading: 'Notifications',
      body: [
        "Notifications pass through Google's service (Android) and Apple's service (iPhone), which receive your device address and the message text.",
        "That is why a notification carries as little as possible: the child's first name and whether they boarded or got off.",
      ],
    },
    {
      heading: 'Changes',
      body: [
        'If the way we handle data changes, we update this page and ask for your consent again when the change is material.',
        `Last updated: ${LEGAL.version}.`,
      ],
    },
  ],
};

export const TERMS_EN: LegalDocument = {
  title: 'Terms of Use',
  updated: LEGAL.version,
  intro: [
    `By using Tammeni you agree to these terms. Service provider: ${LEGAL.operatorEn} — ${LEGAL.contactEmail}.`,
  ],
  sections: [
    {
      heading: 'The service',
      body: [
        'Tammeni records children boarding and getting off with one tap from the driver, notifies guardians, and raises an alert if a trip ends with a child still on board, a trip runs late, or the driver device goes silent.',
        'The service is free today. If subscriptions are added later they will be for schools and transport companies, announced before they start.',
      ],
    },
    {
      heading: 'Important: an aid, not a replacement',
      body: [
        "Tammeni reduces human error. It is not a guarantee of a child's safety and does not replace the responsibility of the driver, the school and the guardian.",
        'Notification delivery depends on things outside our control: network coverage, battery, notification settings, and the Google and Apple services.',
        'In an emergency call the emergency number first (999 in Bahrain). Do not wait for the app.',
      ],
    },
    {
      heading: 'Accounts',
      body: [
        'You must be an adult to create an account. You are responsible for keeping your password secret and for what happens through your account.',
        'You confirm the data you enter is correct and that you are the guardian of the child you add, or authorised by them.',
        'We approve schools and transport companies before guardians can see them, to prevent impersonation.',
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        '- Use the service only for its purpose: the safety of student transport.',
        '- Do not add a child you are not the guardian of, or authorised for.',
        '- Do not try to reach other students or organisations, or test the system for weaknesses without our written permission.',
        '- Do not upload names or photos that do not belong to the registered child.',
        'We may suspend an account that breaks these rules, while keeping the safety records.',
      ],
    },
    {
      heading: 'School and transport company duties',
      body: [
        '- Make sure the drivers they add really work for them.',
        '- Watch alerts and act immediately on any critical one.',
        '- Close an alert only after actually confirming the child is safe: the reason is recorded with the name of whoever closed it.',
      ],
    },
    {
      heading: 'Availability',
      body: [
        'The service may pause for maintenance or for reasons outside our control. We make reasonable efforts to keep it running and do not guarantee uninterrupted operation.',
        'We may change features or stop the service, giving users enough notice to export their data.',
      ],
    },
    {
      heading: 'Limits of liability',
      body: [
        'The service is provided "as is", as far as the law allows.',
        'We are not liable for harm caused by a driver, school or guardian, by network or device failure, or by relying on the app instead of checking directly.',
        'Nothing here limits liability that the law does not allow to be excluded.',
      ],
    },
    {
      heading: 'Ending use',
      body: [
        'You can delete your account at any time in Settings. Trip and alert records remain without a name or photo for the period in the privacy policy.',
      ],
    },
    {
      heading: 'Governing law',
      body: [
        'These terms are governed by the laws of the Kingdom of Bahrain, and its courts have jurisdiction over any dispute.',
        `Contact: ${LEGAL.contactEmail}. Last updated: ${LEGAL.version}.`,
      ],
    },
  ],
};
