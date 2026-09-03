// English and Arabic strings.
// The Arabic is written as connected prose, so clauses join with حروف العطف
// وأدوات الربط ولا تنقطع بنقطة في وسط الجملة، والنقطة تأتي في نهايتها فقط.

export const LOCALES = ['en', 'ar'];

export const STRINGS = {
  en: {
    dir: 'ltr',
    lang: 'en',
    title: 'Cryptographic inventory and post quantum readiness',
    subtitle: 'What cryptography do we run, and what breaks first',
    generated: 'Generated',
    target: 'Target',
    tool: 'Produced by Miftah',

    sectionSummary: 'Summary',
    sectionHorizon: 'The horizon',
    sectionInventory: 'Inventory',
    sectionFindings: 'Findings',
    sectionCertificates: 'Certificates',
    sectionEndpoints: 'Endpoints',
    sectionRoadmap: 'Migration roadmap',
    sectionAgility: 'Crypto agility',
    sectionMethod: 'Method',

    exposedYears: 'years exposed',
    marginYears: 'years of margin',
    sectionDependencies: 'Cryptographic dependencies',
    dependenciesExplain: 'Cryptography is often not written in your code at all. These are the libraries in your manifests that provide it, and what each one implies once a quantum computer exists.',
    colLibrary: 'Library',
    colEcosystem: 'Ecosystem',
    colVersion: 'Version',
    colProvides: 'Provides',
    readiness: 'Post quantum readiness',
    peakRisk: 'Highest asset risk',
    assets: 'Cryptographic assets',
    findings: 'Findings',
    filesScanned: 'Files read',
    needsMigration: 'Assets needing migration',
    alreadyResistant: 'Already quantum resistant',

    moscaHeading: 'Mosca inequality',
    horizonLabel: 'Quantum horizon',
    moscaExplain: 'Data that must stay secret for x years, in an estate that takes y years to migrate, is already exposed when x plus y exceeds z, the years remaining before a cryptographically relevant quantum computer exists.',
    moscaBreached: 'The secrecy requirement outruns the horizon by {deficit} years, so traffic recorded today is readable before the data stops mattering.',
    moscaClear: 'The secrecy requirement fits inside the horizon with {slack} years to spare, though the margin shrinks every year the migration is deferred.',
    shelfLife: 'Data shelf life',
    migrationTime: 'Migration time',
    yearsToHorizon: 'Years to horizon',
    years: 'years',

    colAsset: 'Asset',
    colPrimitive: 'Primitive',
    colClassical: 'Classical',
    colQuantum: 'Quantum',
    colRisk: 'Risk',
    colUses: 'Uses',
    colTarget: 'Target',
    colSeverity: 'Severity',
    colLocation: 'Location',
    colFinding: 'Finding',
    colAdvice: 'Advice',
    colStatus: 'Status',
    colCheck: 'Check',
    colEffort: 'Effort',
    colExpiry: 'Expires',
    colSignature: 'Signature',
    colKey: 'Public key',

    severity: {
      critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'info'
    },
    quantum: {
      broken: 'broken by Shor', weakened: 'weakened by Grover', resistant: 'resistant', unknown: 'unknown'
    },
    classical: {
      broken: 'broken', weak: 'weak', legacy: 'legacy', acceptable: 'acceptable', strong: 'strong'
    },
    status: { pass: 'in place', fail: 'missing', partial: 'partial', manual: 'needs a human' },
    band: { critical: 'critical', high: 'high', medium: 'medium', low: 'low', none: 'none' },

    wave: 'Wave',
    window: 'Window',
    goal: 'Goal',
    noItems: 'Nothing in this wave.',
    noFindings: 'No findings.',
    priorityActions: 'Priority actions',
    agilityScore: 'Agility score',
    methodText: 'Miftah reads source, configuration and certificates, probes live TLS and SSH endpoints, and grades every algorithm it names against a classical verdict and a quantum verdict. The inventory is emitted as CycloneDX 1.6 so it joins the existing software bill of materials rather than sitting beside it. Risk is a function of the algorithm, how long the data must stay secret, and how much of the estate depends on it. Nothing is sent anywhere.',
    footer: 'Miftah is open source under the MIT licence.'
  },

  ar: {
    dir: 'rtl',
    lang: 'ar',
    title: 'جرد التشفير والجاهزية لما بعد الكم',
    subtitle: 'ما التشفير الذي نشغله فعلا وما الذي ينكسر أولا',
    generated: 'تاريخ الإصدار',
    target: 'الهدف',
    tool: 'من إعداد مفتاح',

    sectionSummary: 'الخلاصة',
    sectionHorizon: 'الأفق الزمني',
    sectionInventory: 'الجرد',
    sectionFindings: 'النتائج',
    sectionCertificates: 'الشهادات',
    sectionEndpoints: 'نقاط الاتصال',
    sectionRoadmap: 'خارطة الانتقال',
    sectionAgility: 'مرونة التشفير',
    sectionMethod: 'المنهجية',

    exposedYears: 'سنة من الانكشاف',
    marginYears: 'سنة من الفسحة',
    sectionDependencies: 'اعتماديات التشفير',
    dependenciesExplain: 'التشفير في كثير من الأحيان ليس مكتوبا في شيفرتك أصلا، لذا تدرج هنا المكتبات التي توفره في ملفات الاعتماديات وما يترتب على كل منها متى وجد حاسوب كمي.',
    colLibrary: 'المكتبة',
    colEcosystem: 'المنظومة',
    colVersion: 'الإصدار',
    colProvides: 'يوفر',
    readiness: 'الجاهزية لما بعد الكم',
    peakRisk: 'أعلى خطورة لأصل واحد',
    assets: 'أصول التشفير',
    findings: 'النتائج',
    filesScanned: 'الملفات المقروءة',
    needsMigration: 'أصول تحتاج انتقالا',
    alreadyResistant: 'أصول مقاومة للكم',

    moscaHeading: 'متباينة موسكا',
    horizonLabel: 'الأفق الكمي',
    moscaExplain: 'البيانات التي يجب أن تبقى سرية مدة س سنة، في بيئة يستغرق انتقالها ص سنة، تكون مكشوفة فعلا متى تجاوز مجموع س وص عدد السنوات المتبقية قبل ظهور حاسوب كمي قادر على كسر التشفير.',
    moscaBreached: 'مدة السرية المطلوبة تتجاوز الأفق بمقدار {deficit} سنة، لذا فإن ما يسجل من حركة اليوم يصبح مقروءا قبل أن تفقد البيانات قيمتها.',
    moscaClear: 'مدة السرية المطلوبة تقع داخل الأفق بفارق {slack} سنة، لكن هذا الفارق يتقلص كل عام يؤجل فيه الانتقال.',
    shelfLife: 'مدة سرية البيانات',
    migrationTime: 'مدة الانتقال',
    yearsToHorizon: 'السنوات حتى الأفق',
    years: 'سنة',

    colAsset: 'الأصل',
    colPrimitive: 'النوع',
    colClassical: 'كلاسيكيا',
    colQuantum: 'كميا',
    colRisk: 'الخطورة',
    colUses: 'الاستخدامات',
    colTarget: 'الوجهة',
    colSeverity: 'الدرجة',
    colLocation: 'الموقع',
    colFinding: 'النتيجة',
    colAdvice: 'التوصية',
    colStatus: 'الحالة',
    colCheck: 'البند',
    colEffort: 'الجهد',
    colExpiry: 'تنتهي في',
    colSignature: 'التوقيع',
    colKey: 'المفتاح العام',

    severity: {
      critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة', info: 'معلومة'
    },
    quantum: {
      broken: 'مكسور بخوارزمية شور', weakened: 'مضعف بخوارزمية غروفر', resistant: 'مقاوم', unknown: 'غير محدد'
    },
    classical: {
      broken: 'مكسور', weak: 'ضعيف', legacy: 'قديم', acceptable: 'مقبول', strong: 'قوي'
    },
    status: { pass: 'مطبق', fail: 'غير مطبق', partial: 'جزئي', manual: 'يحتاج مراجعة بشرية' },
    band: { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة', none: 'لا يوجد' },

    wave: 'الموجة',
    window: 'النطاق الزمني',
    goal: 'الهدف',
    noItems: 'لا عناصر في هذه الموجة.',
    noFindings: 'لا نتائج.',
    priorityActions: 'الإجراءات ذات الأولوية',
    agilityScore: 'درجة المرونة',
    methodText: 'يقرأ مفتاح الشيفرة والإعدادات والشهادات، ثم يفحص نقاط الاتصال الحية عبر بروتوكولي طبقة النقل الآمنة والصدفة الآمنة، ويصنف كل خوارزمية يتعرف عليها وفق حكمين أحدهما كلاسيكي والآخر كمي، ويصدر الجرد بصيغة CycloneDX الإصدار 1.6 لأنها الصيغة المعيارية فينضم إلى قوائم مكونات البرمجيات القائمة بدل أن يبقى منفصلا عنها، بينما تحسب الخطورة بدلالة الخوارزمية ومدة سرية البيانات ومقدار اعتماد البيئة عليها، ولا يرسل شيء إلى أي جهة خارجية.',
    footer: 'مفتاح أداة مفتوحة المصدر برخصة إم آي تي.'
  }
};

export function t(locale, key, replacements = {}) {
  const table = STRINGS[locale] || STRINGS.en;
  const path = String(key).split('.');
  let value = table;
  for (const part of path) {
    value = value && value[part] !== undefined ? value[part] : undefined;
  }
  if (value === undefined) {
    let fallback = STRINGS.en;
    for (const part of path) {
      fallback = fallback && fallback[part] !== undefined ? fallback[part] : undefined;
    }
    value = fallback !== undefined ? fallback : key;
  }
  if (typeof value !== 'string') return value;
  return value.replace(/\{(\w+)\}/g, (whole, name) => (replacements[name] !== undefined ? replacements[name] : whole));
}

export default STRINGS;
