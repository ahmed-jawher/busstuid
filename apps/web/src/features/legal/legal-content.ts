// The terms and the privacy policy shown at /terms and /privacy and linked from the stores.
// They are written as numbered clauses, the way an agreement is read and cited, and they
// describe exactly what the code does; change them together with the behaviour.
//
// NOT REVIEWED BY A LAWYER. Before the first real school uses Tammeni, a lawyer in the country
// of operation must read both documents (children's data, Bahrain's Personal Data Protection
// Law 30/2018, and the transfer of data to the server in Germany).

export interface LegalDocument {
  title: string;
  updated: string;
  /** The opening paragraph, before the numbered clauses. */
  preamble: string;
  /** One entry per clause, numbered in the text itself ("1-2 …"). */
  clauses: string[];
}

export const LEGAL = {
  // TODO(owner): the full legal name exactly as it will appear in the App Store and Play
  // Console. Apple shows the developer's real name on the store page.
  operator: '[الاسم الكامل لمالك التطبيق]',
  operatorEn: '[Full legal name of the app owner]',
  contactEmail: 'support.tammeni@gmail.com',
  version: '2026-09-25',
  serverCountry: { ar: 'ألمانيا (فرانكفورت)', en: 'Germany (Frankfurt)' },
} as const;

export const TERMS_AR: LegalDocument = {
  title: 'شروط الاستخدام',
  updated: LEGAL.version,
  preamble: `تُنظّم هذه الشروط استخدام تطبيق «طمّني» وموقعه («الخدمة»)، المقدَّم من ${LEGAL.operator} («المزوّد»). يُعدّ إنشاء الحساب أو استخدام الخدمة قبولاً صريحاً وغير مشروط بهذه الشروط وبسياسة الخصوصية المرفقة بها. وإذا لم توافق على أيٍّ من بنودها، فيتعيّن عليك الامتناع عن استخدام الخدمة.`,
  clauses: [
    '1- التعريفات: يُقصد بـ «المستخدم» كل شخص ينشئ حساباً في الخدمة؛ وبـ «وليّ الأمر» المستخدم الذي يسجّل طالباً ويقرّ بولايته عليه أو بتفويضه منه؛ وبـ «السائق» المستخدم الذي يشغّل رحلة؛ وبـ «المنظمة» المدرسة أو الروضة أو شركة النقل أو السائق المستقل المسجّل في الخدمة؛ وبـ «الرحلة» نقل الطلاب من وإلى المدرسة في وقت محدد؛ وبـ «الإنذار» التنبيه الذي يصدره النظام عند احتمال بقاء طالب في المركبة أو تأخّر رحلة أو انقطاع جهاز السائق.',
    '2- محل الخدمة: توفّر الخدمة وسيلة لتسجيل صعود الطالب ونزوله بضغطة من السائق، وإشعار وليّ الأمر بذلك، وإصدار إنذار عند انتهاء رحلة وفيها طالب لم يُسجَّل نزوله، أو تأخّر الرحلة عن وقتها المقرّر، أو انقطاع الإشارة من جهاز السائق أثناء الرحلة.',
    '3- الطبيعة المساعِدة للخدمة: الخدمة أداة مساعِدة للحدّ من الخطأ البشري، ولا تُعدّ بأي حال ضماناً لسلامة الطالب، ولا بديلاً عن الالتزامات الواقعة على السائق أو المنظمة أو وليّ الأمر. ويقرّ المستخدم بأن مسؤولية التحقق المباشر من خلوّ المركبة تظل قائمة على السائق والمنظمة في جميع الأحوال.',
    '4- الاعتماد على وسائل خارجة عن سيطرة المزوّد: يقرّ المستخدم بأن وصول الإشعارات يعتمد على تغطية شبكة الاتصالات، وشحن الجهاز وإعداداته، وخدمات الإشعارات التابعة لشركتَي Google وApple، وأن هذه الوسائل خارجة عن سيطرة المزوّد، وأن انقطاعها أو تأخّرها لا يُرتّب مسؤولية عليه.',
    '5- حالات الطوارئ: في أي حالة يُشتبه فيها بخطر على الطالب، يتعيّن على المستخدم الاتصال فوراً بأرقام الطوارئ المعتمدة في بلده (999 في مملكة البحرين) وعدم انتظار إشعار من الخدمة أو الاكتفاء به.',
    '6- أهلية التعاقد: يُشترط في المستخدم أن يكون كامل الأهلية القانونية وبالغاً السن المقرّرة نظاماً. ولا تُنشأ حسابات للأطفال، ولا تُوجَّه الخدمة إليهم.',
    '7- صحة البيانات: يقرّ المستخدم بأن البيانات التي يدخلها صحيحة ومحدَّثة، وبأنه وليّ أمر الطالب الذي يسجّله أو مفوَّض منه تفويضاً صحيحاً، ويتحمّل وحده تبعات مخالفة ذلك.',
    '8- الحساب وكلمة المرور: يلتزم المستخدم بالمحافظة على سرية بيانات دخوله، ويُعدّ مسؤولاً عن كل استخدام يتم عبر حسابه، ويلتزم بإخطار المزوّد فور علمه بأي استخدام غير مصرّح به. ويجوز للمستخدم تفعيل التحقق بخطوتين، ويُوصى بذلك لمديري المنظمات.',
    '9- الموافقة على المستندات: لا يُنشأ الحساب إلا بموافقة صريحة على هذه الشروط وعلى سياسة الخصوصية، وتُحفظ الموافقة لدى المزوّد مقترنةً برقم النسخة ووقت الموافقة وعنوان بروتوكول الإنترنت ووصف الجهاز، وتُعدّ حجّة على المستخدم. وعند تعديل أيٍّ من المستندين تعديلاً جوهرياً، يُطلب من المستخدم إقرار الموافقة من جديد قبل متابعة الاستخدام.',
    '10- الاستخدام المقبول: يلتزم المستخدم بقصر استخدام الخدمة على غرضها، ويُحظر عليه تسجيل طالب لا ولاية له عليه ولا تفويض، أو محاولة الوصول إلى بيانات طلاب أو منظمات أخرى، أو اختبار أمن النظام أو اختراقه أو تعطيله، أو رفع أسماء أو صور لا تخصّ الطالب المسجَّل، أو استخدام الخدمة استخداماً مخالفاً للنظام أو الآداب العامة.',
    '11- التزامات المنظمة: تلتزم المنظمة بالتحقق من أن السائقين المضافين إليها يعملون لديها فعلاً، وبمتابعة الإنذارات والتصرّف الفوري حيالها، وبعدم إغلاق أي إنذار إلا بعد التأكد الفعلي من سلامة الطالب. ويُسجَّل إغلاق الإنذار باسم من أغلقه وسببه ووقته.',
    '12- بيانات الطلاب: تُعالَج بيانات الطالب وصورته وفق سياسة الخصوصية، ولا تُتاح للمنظمة إلا بعد قبول طلب الانضمام، ولا تُستخدم إلا لأغراض تشغيل الرحلة وسلامة الطالب.',
    '13- سجلات السلامة: تُحفظ سجلات الرحلات والإنذارات وسجل التدقيق بطريقة لا تقبل التعديل أو الحذف، ويُعدّ ما ورد فيها بياناً معتمداً عند النزاع، ما لم يثبت خلاف ذلك.',
    '14- المقابل المالي: الخدمة مجانية في تاريخ إصدار هذه النسخة. ويجوز للمزوّد استحداث اشتراكات تُفرض على المدارس وشركات النقل دون أولياء الأمور، على أن يُعلن عنها قبل سريانها بمدة كافية.',
    '15- الملكية الفكرية: تظل جميع حقوق الملكية الفكرية في الخدمة وبرمجياتها وعلاماتها مملوكة للمزوّد، ولا يُخوَّل المستخدم بموجب هذه الشروط إلا ترخيصاً شخصياً غير حصري وغير قابل للتنازل لاستخدام الخدمة وفق أحكامها.',
    '16- التوافر والانقطاع: لا يضمن المزوّد عمل الخدمة دون انقطاع أو خلوّها من الأخطاء، ويجوز له إيقافها مؤقتاً للصيانة أو لأسباب فنية أو قهرية. ويبذل المزوّد عناية معقولة لإبقاء الخدمة متاحة واستعادتها عند الانقطاع.',
    '17- تعديل الخدمة أو إيقافها: يجوز للمزوّد تعديل مزايا الخدمة أو إيقافها كلياً، على أن يُخطر المستخدمين قبل الإيقاف بمدة كافية لتصدير بياناتهم.',
    '18- حدود المسؤولية: تُقدَّم الخدمة «كما هي» في حدود ما يجيزه النظام. ولا يُسأل المزوّد عن الأضرار الناشئة عن خطأ السائق أو المنظمة أو وليّ الأمر، ولا عن انقطاع الشبكة أو تعطّل الجهاز، ولا عن اعتماد المستخدم على الخدمة وحدها دون التحقق المباشر. ولا يمسّ هذا البند أي مسؤولية لا يجيز النظام الاتفاق على استبعادها.',
    '19- التعويض: يلتزم المستخدم بتعويض المزوّد عن كل مطالبة أو ضرر ينشأ عن مخالفته هذه الشروط، أو عن إدخاله بيانات غير صحيحة، أو عن تسجيله طالباً دون ولاية أو تفويض.',
    '20- القوة القاهرة: لا يُسأل أي من الطرفين عن الإخلال الناشئ عن سبب أجنبي خارج عن إرادته، بما في ذلك انقطاع خدمات الاتصالات أو الكهرباء أو الخدمات السحابية أو القرارات الحكومية.',
    '21- إيقاف الحساب: يجوز للمزوّد إيقاف الحساب المخالف أو تقييده، مع الاحتفاظ بسجلات السلامة للمدد المقررة في سياسة الخصوصية.',
    '22- إنهاء الاستخدام: للمستخدم حذف حسابه في أي وقت من إعدادات التطبيق. وتظل سجلات الرحلات والإنذارات محفوظة دون اسم الطالب أو صورته للمدد المقررة في سياسة الخصوصية.',
    '23- تعديل الشروط: يجوز للمزوّد تعديل هذه الشروط، ويُعلَن التعديل في التطبيق ويُطلب إقرار الموافقة عليه إن كان جوهرياً، ولا يسري التعديل بأثر رجعي على وقائع سابقة.',
    '24- الإشعارات والمراسلات: تُعدّ المراسلة عبر البريد الإلكتروني المسجَّل في الحساب وسيلة إخطار صحيحة بين الطرفين.',
    '25- القانون الواجب التطبيق والاختصاص القضائي: تخضع هذه الشروط لأنظمة مملكة البحرين وتُفسَّر وفقاً لها، وتختص محاكم مملكة البحرين وحدها بالفصل في أي نزاع ينشأ عنها.',
    `26- التواصل: توجَّه جميع الاستفسارات والإخطارات المتعلقة بهذه الشروط إلى ${LEGAL.contactEmail}. ورقم نسخة هذه الشروط ${LEGAL.version}.`,
  ],
};

export const PRIVACY_AR: LegalDocument = {
  title: 'سياسة الخصوصية',
  updated: LEGAL.version,
  preamble: `تبيّن هذه السياسة كيفية معالجة البيانات الشخصية في تطبيق «طمّني»، والمسؤول عن معالجتها هو ${LEGAL.operator}، ويمكن التواصل معه في كل ما يتعلق بالخصوصية عبر ${LEGAL.contactEmail}. وتُقرأ هذه السياسة مع شروط الاستخدام، وتُشكّل معها اتفاقاً واحداً.`,
  clauses: [
    '1- نطاق السياسة: تسري هذه السياسة على البيانات التي تُعالَج من خلال التطبيق والموقع والخدمات المرتبطة بهما، ولا تسري على أي خدمة تابعة لطرف آخر يُنقل إليها المستخدم.',
    '2- بيانات صاحب الحساب: يُعالَج الاسم بالعربية والإنجليزية، والبريد الإلكتروني، ورقم الجوال، ولغة الواجهة، وإعدادات الإشعارات. ولا تُخزَّن كلمة المرور بصيغتها الأصلية في أي حال، وإنما تُخزَّن بصيغة مشفّرة لا يمكن ردّها إلى أصلها. ويُخزَّن مفتاح التحقق بخطوتين مشفّراً عند تفعيله.',
    '3- بيانات الطالب: يُدخلها وليّ أمره وتشمل الاسم، وتاريخ الميلاد، واسم المدرسة، وملاحظات اختيارية، وصورة وجه واضحة الغرض الوحيد منها تمكين السائق من التعرّف على الطالب.',
    '4- بيانات تشغيل الرحلة: تُسجَّل واقعة صعود الطالب أو نزوله أو غيابه، ومن سجّلها، ووقتها بتوقيت جهاز المسجِّل وتوقيت الخادم، وسجل الإنذارات وإجراءاتها، وسجل تدقيق للعمليات الحساسة كقبول طالب أو إنهاء رحلة قسراً أو عرض قائمة الطلاب بصورهم.',
    '5- بيانات الموقع: يُسجَّل موقع الجهاز في لحظة تسجيل الصعود أو النزول فقط، وبموافقة السائق على إذن الموقع. ولا يوجد تتبّع مستمر للموقع، ولا يُعرف موقع المركبة بين تسجيلَين.',
    '6- بيانات الجهاز: يُعالَج معرّف الجهاز الخاص بالإشعارات ووصف المتصفح أو الجهاز، بغرض إيصال الإشعارات وتمييز الأجهزة المسجَّلة.',
    '7- أغراض المعالجة: تُعالَج البيانات لأغراض تشغيل الخدمة، وإشعار وليّ الأمر بحالة الطالب، وإصدار الإنذارات ومتابعتها، وإثبات وقائع السلامة عند التحقيق في حادثة، وتأمين الحسابات ومنع إساءة الاستخدام.',
    '8- أساس المعالجة: تستند معالجة بيانات الطالب وصورته إلى الموافقة الصريحة من وليّ أمره عند تسجيله، وتستند معالجة بيانات الحساب إلى تنفيذ الخدمة المطلوبة، وتستند سجلات السلامة إلى المصلحة المشروعة في حماية الطالب وإثبات الوقائع.',
    '9- سحب الموافقة: لوليّ الأمر سحب موافقته في أي وقت، ويترتب على السحب وقف الخدمة عن الطالب المعني، دون أن يمسّ ذلك مشروعية المعالجة السابقة.',
    '10- حدود الاطّلاع: يطّلع وليّ الأمر على بيانات أطفاله فقط؛ وتطّلع المنظمة على بيانات الطلاب المرتبطين بها فقط، ولا تظهر لها صورة الطالب ولا تاريخ ميلاده قبل قبول طلب الانضمام؛ ويطّلع السائق على طلاب رحلته فقط؛ ويطّلع مشغّل المنصة على بيانات المنظمات لغرض اعتمادها دون بيانات الأطفال. ويمنع النظام تقنياً وصول أي منظمة إلى بيانات طلاب منظمة أخرى.',
    '11- عدم الإفصاح: لا تُباع البيانات ولا تُستخدم في الإعلانات ولا تُشارَك مع جهات تسويقية. ولا يُفصح عنها لغير ما ذُكر في هذه السياسة إلا بأمر قضائي أو طلب من جهة مختصة وفق النظام.',
    '12- مزوّدو الخدمة: تُستخدم خدمات إشعارات تابعة لشركتَي Google وApple، ويصلها معرّف الجهاز ونص الإشعار، ولهذا يُكتفى في نص الإشعار بالاسم الأول للطالب وحالته. كما تُستخدم خدمة بريد إلكتروني لإرسال رموز التحقق.',
    `13- مكان التخزين: تُخزَّن البيانات حالياً على خادم في ${LEGAL.serverCountry.ar}، وتُنقل مشفّرة عبر بروتوكول آمن. وتُحفظ النسخ الاحتياطية مشفّرة بمفتاح مستقل. وإذا اشترط النظام في بلد التشغيل بقاء البيانات داخله، تُنقل البيانات إلى خادم داخل ذلك البلد قبل التشغيل الرسمي.`,
    '14- مدد الحفظ: تُحفظ سجلات الرحلات سنتين، وسجلات الإنذارات وسجل التدقيق ثلاث سنوات، والإشعارات المرسلة سنة، ورموز البريد أسبوعاً، وجلسات الدخول ثلاثين يوماً. ولا يُحذف أي إنذار مفتوح قبل إغلاقه. وللمنظمة تمديد هذه المدد، ولا يجوز تقصيرها عن سنة واحدة لارتباطها بإثبات وقائع السلامة.',
    '15- حق الاطّلاع والنسخ: لوليّ الأمر تصدير نسخة كاملة من بيانات طفله، بما فيها صورته، من داخل التطبيق.',
    '16- حق التصحيح: للمستخدم تعديل بياناته وبيانات طفله وصورته من داخل التطبيق.',
    '17- حق الحذف: لوليّ الأمر حذف بيانات طفله، فيُحذف الاسم والصورة ويُلغى ارتباط الطالب بالمنظمات. وتبقى سجلات الرحلات والإنذارات دون اسم أو صورة باعتبارها سجلات سلامة. وللمستخدم حذف حسابه من الإعدادات، فتُحذف بياناته الشخصية وصور الأطفال الذين لا وليّ أمر آخر لهم.',
    '18- حق الشكوى: للمستخدم التواصل مع المزوّد أولاً، ثم اللجوء إلى هيئة حماية البيانات الشخصية في مملكة البحرين إذا لم يقتنع بالمعالجة أو بالرد.',
    '19- الأطفال: لا تُوجَّه الخدمة إلى الأطفال ولا تُنشأ لهم حسابات، ولا تُجمع منهم بيانات مباشرة، ولا تُعرض عليهم إعلانات. ويتولى وليّ الأمر إدخال بيانات الطفل والتصرف فيها.',
    '20- تدابير الأمن: تُنقل البيانات مشفّرة، وتُخزَّن كلمات المرور بصيغة غير قابلة للردّ، ويتاح التحقق بخطوتين لكل حساب. وسجلات الرحلات والإنذارات والموافقات «للإضافة فقط» فلا تقبل التعديل أو الحذف، ويُسجَّل لكل عملية حساسة منفّذها ووقتها.',
    '21- الإبلاغ عن الاختراق: لا يوجد نظام آمن بصورة مطلقة. وفي حال وقوع اختراق يمسّ البيانات الشخصية، يلتزم المزوّد بإخطار المتضررين والجهة المختصة في أقرب وقت ممكن ووفق ما يقضي به النظام.',
    '22- ملفات الارتباط والتخزين المحلي: يستخدم التطبيق تخزيناً محلياً على الجهاز لحفظ جلسة الدخول وتفضيلات العرض والنقرات غير المرسَلة عند انقطاع الشبكة، ولا يُستخدم لأغراض إعلانية.',
    '23- تعديل السياسة: يجوز تعديل هذه السياسة، ويُعلَن التعديل في التطبيق، ويُطلب إقرار الموافقة عليه إن كان جوهرياً.',
    `24- التواصل: توجَّه طلبات ممارسة الحقوق والاستفسارات إلى ${LEGAL.contactEmail}. ورقم نسخة هذه السياسة ${LEGAL.version}.`,
  ],
};

export const TERMS_EN: LegalDocument = {
  title: 'Terms of Use',
  updated: LEGAL.version,
  preamble: `These terms govern the use of the Tammeni application and website (the "Service"), provided by ${LEGAL.operatorEn} (the "Provider"). Creating an account or using the Service constitutes express and unconditional acceptance of these terms and of the privacy policy attached to them. If you do not agree to any clause, you must not use the Service.`,
  clauses: [
    '1- Definitions: "User" means any person who creates an account in the Service; "Guardian" means a User who registers a student and affirms guardianship over that student or authorisation from the guardian; "Driver" means a User who operates a trip; "Organisation" means a school, kindergarten, transport company or independent driver registered in the Service; "Trip" means the carriage of students to or from school at a stated time; "Alert" means the warning the system raises when a student may remain in the vehicle, a trip runs late, or a driver device goes silent.',
    '2- Subject of the Service: The Service provides a means of recording each student boarding and alighting by one tap from the Driver, notifying the Guardian, and raising an Alert where a trip ends while a student has not been recorded as having alighted, a trip exceeds its scheduled time, or the signal from the driver device is interrupted during a trip.',
    "3- Assistive nature: The Service is an aid intended to reduce human error. It is in no circumstances a guarantee of a student's safety, nor a substitute for the obligations of the Driver, the Organisation or the Guardian. The User acknowledges that the duty to check the vehicle directly remains with the Driver and the Organisation in all cases.",
    "4- Reliance on means outside the Provider's control: The User acknowledges that delivery of notifications depends on network coverage, device battery and settings, and the notification services of Google and Apple, all of which are outside the Provider's control, and that their interruption or delay gives rise to no liability on the Provider.",
    '5- Emergencies: Where a risk to a student is suspected, the User must immediately call the emergency number in force in their country (999 in the Kingdom of Bahrain) and must not wait for, or rely upon, a notification from the Service.',
    '6- Capacity: The User must have full legal capacity and be of the age required by law. No accounts are created for children, and the Service is not directed at them.',
    '7- Accuracy of data: The User affirms that the data entered is accurate and current, and that they are the guardian of the student registered or are duly authorised, and bears sole responsibility for any breach of this clause.',
    '8- Account and password: The User shall keep their sign-in details confidential, is responsible for all use made through their account, and shall notify the Provider upon becoming aware of any unauthorised use. The User may enable two-step verification, which is recommended for administrators of Organisations.',
    '9- Acceptance of the documents: No account is created without express acceptance of these terms and of the privacy policy. The acceptance is retained by the Provider together with the version number, the time of acceptance, the internet protocol address and the device description, and constitutes evidence against the User. Where either document is materially amended, the User is required to accept it again before continuing to use the Service.',
    '10- Acceptable use: The User shall confine use of the Service to its purpose, and is prohibited from registering a student over whom they have neither guardianship nor authorisation, attempting to reach the data of other students or Organisations, testing, breaching or disrupting the security of the system, uploading names or photographs not belonging to the registered student, or using the Service in any manner contrary to law or public morals.',
    "11- Obligations of the Organisation: The Organisation shall verify that the Drivers it adds are in fact employed by it, shall monitor Alerts and act upon them immediately, and shall not close any Alert before actually confirming the student's safety. The closing of an Alert is recorded with the identity of the person closing it, the reason and the time.",
    "12- Student data: A student's data and photograph are processed in accordance with the privacy policy, are not made available to the Organisation before the enrolment request is approved, and are used only for the purposes of operating the Trip and the student's safety.",
    '13- Safety records: Trip records, Alert records and the audit trail are kept in a form that cannot be amended or deleted, and their content constitutes accepted evidence in the event of a dispute, unless the contrary is proven.',
    '14- Consideration: The Service is free of charge at the date of this version. The Provider may introduce subscriptions charged to schools and transport companies and not to Guardians, provided they are announced a sufficient period before taking effect.',
    '15- Intellectual property: All intellectual property rights in the Service, its software and its marks remain the property of the Provider. These terms grant the User no more than a personal, non-exclusive and non-transferable licence to use the Service in accordance with them.',
    '16- Availability and interruption: The Provider does not warrant that the Service will operate uninterrupted or free of error, and may suspend it temporarily for maintenance or for technical or force-majeure reasons. The Provider shall exercise reasonable care to keep the Service available and to restore it upon interruption.',
    '17- Modification or discontinuation: The Provider may modify the features of the Service or discontinue it entirely, provided that Users are notified a sufficient period before discontinuation to export their data.',
    '18- Limitation of liability: The Service is provided "as is" to the extent permitted by law. The Provider is not liable for damage arising from the fault of the Driver, the Organisation or the Guardian, nor for network interruption or device failure, nor for the User\'s reliance on the Service alone without direct verification. This clause does not affect any liability that the law does not permit to be excluded by agreement.',
    "19- Indemnity: The User shall indemnify the Provider against any claim or damage arising from the User's breach of these terms, from the entry of inaccurate data, or from registering a student without guardianship or authorisation.",
    '20- Force majeure: Neither party is liable for a breach arising from a foreign cause beyond its control, including interruption of telecommunications, electricity or cloud services, or governmental decisions.',
    '21- Suspension of an account: The Provider may suspend or restrict an account in breach of these terms, while retaining safety records for the periods stated in the privacy policy.',
    "22- Termination of use: The User may delete their account at any time from the application settings. Trip and Alert records remain retained without the student's name or photograph for the periods stated in the privacy policy.",
    '23- Amendment of the terms: The Provider may amend these terms. The amendment is announced in the application and acceptance is required where it is material. No amendment applies retroactively to prior events.',
    '24- Notices: Correspondence through the email address registered in the account constitutes valid notice between the parties.',
    '25- Governing law and jurisdiction: These terms are governed by and construed in accordance with the laws of the Kingdom of Bahrain, and the courts of the Kingdom of Bahrain have exclusive jurisdiction over any dispute arising out of them.',
    `26- Contact: All enquiries and notices relating to these terms shall be addressed to ${LEGAL.contactEmail}. The version number of these terms is ${LEGAL.version}.`,
  ],
};

export const PRIVACY_EN: LegalDocument = {
  title: 'Privacy Policy',
  updated: LEGAL.version,
  preamble: `This policy states how personal data is processed in the Tammeni application. The controller of that data is ${LEGAL.operatorEn}, who may be contacted on all matters of privacy at ${LEGAL.contactEmail}. This policy is read together with the terms of use and forms a single agreement with them.`,
  clauses: [
    '1- Scope: This policy applies to data processed through the application, the website and the services connected with them, and does not apply to any third-party service to which the User is directed.',
    '2- Account holder data: The name in Arabic and English, the email address, the phone number, the interface language and the notification settings are processed. The password is under no circumstances stored in its original form; it is stored in an encrypted form that cannot be reversed. The two-step verification key is stored encrypted where enabled.',
    "3- Student data: Entered by the student's Guardian, comprising the name, the date of birth, the school name, optional notes, and a clear face photograph whose sole purpose is to enable the Driver to recognise the student.",
    "4- Trip operation data: Each boarding, alighting or absence is recorded, together with the person who recorded it, the time by that person's device and by the server, the record of Alerts and the actions taken on them, and an audit trail of sensitive operations such as approving a student, forcing a trip to end, or viewing the student list with photographs.",
    "5- Location data: The location of the device is recorded at the moment of a boarding or alighting record only, and with the Driver's consent to the location permission. There is no continuous location tracking, and the position of the vehicle between two records is not known.",
    '6- Device data: The device notification identifier and the browser or device description are processed for the purpose of delivering notifications and distinguishing registered devices.',
    "7- Purposes of processing: Data is processed to operate the Service, to notify the Guardian of the student's status, to raise and follow Alerts, to evidence safety events when an incident is investigated, and to secure accounts and prevent misuse.",
    "8- Basis of processing: The processing of a student's data and photograph rests on the express consent of their Guardian given at registration; the processing of account data rests on performance of the requested Service; and safety records rest on the legitimate interest in protecting the student and evidencing events.",
    '9- Withdrawal of consent: The Guardian may withdraw consent at any time, whereupon the Service ceases for the student concerned, without affecting the lawfulness of processing carried out beforehand.',
    '10- Limits of access: A Guardian sees only their own children; an Organisation sees only the students linked to it, and neither the photograph nor the date of birth is shown to it before the enrolment request is approved; a Driver sees only the students on their own trip; the platform operator sees Organisation data for the purpose of approval and no child data. The system technically prevents any Organisation from reaching the students of another.',
    '11- Non-disclosure: Data is not sold, is not used for advertising and is not shared with marketing parties. It is not disclosed otherwise than as stated in this policy, save under a judicial order or a request from a competent authority in accordance with the law.',
    "12- Service providers: Notification services of Google and Apple are used and receive the device identifier and the text of the notification; for that reason the notification text is confined to the student's first name and status. An email service is used to send verification codes.",
    `13- Place of storage: Data is currently stored on a server in ${LEGAL.serverCountry.en} and is transmitted encrypted over a secure protocol. Backups are kept encrypted under a separate key. Where the law of the country of operation requires data to remain within it, the data is moved to a server inside that country before official operation.`,
    '14- Retention periods: Trip records are kept for two years; Alert records and the audit trail for three years; sent notifications for one year; email codes for one week; and sign-in sessions for thirty days. No open Alert is deleted before it is closed. An Organisation may extend these periods; they may not be shortened below one year, being connected to the evidencing of safety events.',
    "15- Right of access and copy: A Guardian may export a complete copy of their child's data, including the photograph, from within the application.",
    "16- Right of correction: The User may amend their own data and their child's data and photograph from within the application.",
    "17- Right of deletion: A Guardian may delete their child's data, whereupon the name and photograph are deleted and the student's links to Organisations are removed. Trip and Alert records remain without a name or photograph, being safety records. The User may delete their account from the settings, whereupon their personal data and the photographs of children having no other guardian are deleted.",
    '18- Right of complaint: The User may contact the Provider first and may then refer the matter to the Personal Data Protection Authority in the Kingdom of Bahrain if not satisfied with the processing or the response.',
    "19- Children: The Service is not directed at children, no accounts are created for them, no data is collected from them directly, and no advertising is shown to them. The Guardian enters and controls the child's data.",
    '20- Security measures: Data is transmitted encrypted, passwords are stored in an irreversible form, and two-step verification is available for every account. Trip, Alert and acceptance records are append-only and admit of no amendment or deletion, and every sensitive operation is recorded with its author and time.',
    '21- Breach notification: No system is absolutely secure. In the event of a breach affecting personal data, the Provider shall notify those affected and the competent authority as soon as possible and as required by law.',
    '22- Cookies and local storage: The application uses local storage on the device to keep the sign-in session, display preferences, and taps not yet sent while the network is interrupted. It is not used for advertising purposes.',
    '23- Amendment of the policy: This policy may be amended. The amendment is announced in the application and acceptance is required where it is material.',
    `24- Contact: Requests to exercise rights and enquiries shall be addressed to ${LEGAL.contactEmail}. The version number of this policy is ${LEGAL.version}.`,
  ],
};
