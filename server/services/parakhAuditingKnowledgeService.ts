export type ParakhAuditLanguage = 'english' | 'hindi' | 'hinglish';
export type ParakhAuditMode = 'answer' | 'example' | 'simpler' | 'quiz';
type Localised = Record<ParakhAuditLanguage, string>;
type AuditChapter = { chapterNumber: number; title: string; aliases: string[]; answer: Localised; example: Localised; simpler: Localised; quiz: Localised };

export const PARAKH_AUDIT_SOURCE_URL = 'https://www.icai.org/post/sm-inter-p5-may2027';
export const PARAKH_AUDIT_APPLICABILITY = 'The official ICAI Paper 5 catalogue is headed Applicable for May 2027 Exam Onwards. Confirm the student’s exact attempt, applicable Standards on Auditing, Code of Ethics, statutory requirements, RTP, corrigenda and exclusions before relying on any reporting or compliance conclusion.';

const CHAPTERS: AuditChapter[] = [
  {
    chapterNumber: 1, title: 'Nature, Objective and Scope of Audit',
    aliases: ['nature objective and scope of audit', 'objective and scope of audit', 'nature and scope of audit', 'objective of audit', 'reasonable assurance', 'audit limitations', 'auditor responsibility', 'audit scope', 'ऑडिट की प्रकृति', 'लेखापरीक्षा का उद्देश्य'],
    answer: {
      english: 'An audit is an independent examination of information or processes against suitable criteria to obtain evidence and report a conclusion. In a financial-statement audit, the auditor seeks reasonable assurance that the statements as a whole are free from material misstatement, whether due to fraud or error, and expresses an opinion. Reasonable assurance is high but not absolute: audits use sampling and professional judgement, evidence is often persuasive rather than conclusive, and collusion, management override or concealed arrangements can limit detection. Management and those charged with governance retain responsibility for preparing the financial statements, maintaining relevant internal control and providing access to information. The auditor is responsible for planning and performing the audit under applicable requirements and obtaining sufficient appropriate evidence. Audit scope concerns the subject matter, period, criteria, procedures and boundaries of the engagement. An audit does not guarantee future viability, business success or the complete absence of fraud. Distinguish audit from accounting, investigation, review and agreed-upon procedures; the objective and assurance level differ.',
      hinglish: 'Audit ek independent examination hai jisme information/process ko suitable criteria ke against test karke evidence collect aur conclusion report kiya jata hai. Financial statement audit mein auditor reasonable assurance leta hai ki statements material misstatement se free hain, fraud ya error dono ke karan. Reasonable assurance high hai, absolute nahi: sampling, judgement, persuasive evidence, collusion aur management override jaise limits hote hain. Financial statements prepare karna, relevant internal control maintain karna aur information dena management/governance ki responsibility hai. Auditor applicable requirements ke under audit plan/perform karke sufficient appropriate evidence leta hai. Audit future success ya fraud ki complete absence guarantee nahi karta. Audit, review, investigation aur agreed-upon procedures ko mix mat karo—objective aur assurance alag hain.',
      hindi: 'Audit एक independent examination है जिसमें information या processes को suitable criteria के विरुद्ध जाँचकर evidence प्राप्त किया जाता है और conclusion report किया जाता है। Financial-statement audit में auditor reasonable assurance प्राप्त करता है कि statements material misstatement से free हैं, चाहे कारण fraud हो या error। Reasonable assurance high है, absolute नहीं; sampling, professional judgement, persuasive evidence, collusion और management override जैसी limitations रहती हैं। Financial statements तैयार करना, internal control रखना और information देना management/governance की जिम्मेदारी है। Auditor applicable requirements के अनुसार audit plan तथा perform करके sufficient appropriate evidence प्राप्त करता है। Audit future success या fraud की पूर्ण अनुपस्थिति की guarantee नहीं है।',
    },
    example: {
      english: 'A company’s sales ledger shows ₹8 crore revenue. The auditor does not simply certify the number: the team tests selected transactions to invoices and dispatch records, checks cut-off around year-end, examines credit notes after year-end and evaluates whether the accounting policy and disclosures are appropriate. The conclusion is based on the evidence obtained and materiality, not on checking every transaction.',
      hinglish: 'Sales ledger ₹8 crore revenue dikhata hai. Auditor sirf number certify nahi karta: selected sales ko invoice/dispatch se test karta hai, year-end cut-off check karta hai, subsequent credit notes dekhta hai aur accounting policy/disclosure evaluate karta hai. Opinion evidence aur materiality par based hota hai, har transaction check karne par nahi.',
      hindi: 'Sales ledger ₹8 crore revenue दिखाता है। Auditor selected transactions को invoice और dispatch से test करता है, year-end cut-off जाँचता है, बाद की credit notes देखता है और policy/disclosure evaluate करता है। Conclusion obtained evidence और materiality पर आधारित होता है।',
    },
    simpler: {
      english: 'Audit is an independent evidence-based check, not a guarantee. The auditor gives an opinion on whether the statements are materially reliable under the applicable reporting framework.',
      hinglish: 'Audit independent evidence-based check hai, guarantee nahi. Auditor applicable framework ke under batata hai statements materially reliable hain ya nahi.',
      hindi: 'Audit स्वतंत्र evidence-based जाँच है, guarantee नहीं। Auditor बताता है कि applicable framework के अनुसार statements materially reliable हैं या नहीं।',
    },
    quiz: {
      english: 'A user says, “The company received an unmodified audit opinion, so fraud is impossible and the company cannot fail next year.” Identify the two misconceptions and explain the proper assurance boundary.',
      hinglish: 'Koi kehta hai unmodified opinion ka matlab fraud impossible aur company next year fail nahi ho sakti. Dono misconceptions identify karo.',
      hindi: 'कोई कहता है कि unmodified opinion का अर्थ fraud असंभव है और company अगले वर्ष fail नहीं हो सकती। दोनों misconceptions समझाएँ।',
    },
  },
  {
    chapterNumber: 2, title: 'Audit Strategy, Audit Planning and Audit Programme',
    aliases: ['audit strategy audit planning and audit programme', 'audit strategy', 'audit planning', 'audit programme', 'audit plan', 'engagement team planning', 'लेखापरीक्षा योजना', 'ऑडिट प्रोग्राम'],
    answer: {
      english: 'Audit strategy sets the overall scope, timing and direction of the engagement and guides resource deployment. Audit planning translates that strategy into a more detailed plan of risk assessment and further audit procedures. An audit programme describes the nature, timing and extent of planned procedures for relevant areas and may be updated as evidence changes. Planning includes understanding the entity and its environment, identifying significant classes of transactions and disclosures, considering materiality, assessing risks, deciding the audit approach, assigning experienced staff, using specialists where needed and coordinating locations or components. Planning is continuous and iterative, not a one-time form completed at the start. A change in business model, system, regulation, staffing or evidence may require the strategy and programme to be revised. Proper planning improves effectiveness and efficiency, but it does not mean procedures can be mechanically applied without professional judgement.',
      hinglish: 'Audit strategy engagement ka overall scope, timing aur direction decide karti hai aur resources guide karti hai. Audit planning us strategy ko detailed risk assessment aur further procedures mein convert karta hai. Audit programme relevant areas ke procedures ka nature, timing aur extent batata hai. Planning mein entity/environment samajhna, materiality, risks, audit approach, staff/specialist allocation aur locations coordination aata hai. Planning continuous aur iterative hai—one-time form nahi. Business model, system, regulation ya evidence badle toh strategy/programme update karo. Procedures mechanical tareeke se apply nahi karne; professional judgement zaroori hai.',
      hindi: 'Audit strategy engagement का overall scope, timing और direction तय करती है तथा resources guide करती है। Audit planning इसे detailed risk assessment और further audit procedures में बदलता है। Audit programme relevant areas की procedures का nature, timing और extent बताता है। Planning में entity और environment समझना, materiality, risks, audit approach, staff/specialists की allocation और locations coordination शामिल हैं। Planning continuous process है; business model, system, regulation या evidence बदलने पर इसे revise करना पड़ सकता है।',
    },
    example: {
      english: 'A retailer is migrating to a new ERP system during the year. The audit strategy may allocate IT audit expertise and plan interim work; the audit plan assesses risks around data migration and revenue processing; the audit programme lists tests of access controls, reconciliations, interface completeness and selected sales transactions. If migration testing reveals control failures, the programme is revised.',
      hinglish: 'Retailer year ke beech ERP migrate karta hai. Strategy IT expertise allocate karegi; plan data migration/revenue risk assess karega; programme access controls, reconciliations, interface completeness aur sales tests list karega. Control failure mile toh programme revise hoga.',
      hindi: 'Retailer वर्ष के बीच ERP migrate करता है। Strategy IT expertise allocate करेगी; plan data migration और revenue risks assess करेगा; programme access controls, reconciliations और sales tests बताएगा। Control failure मिलने पर programme revise होगा।',
    },
    simpler: {
      english: 'Strategy is the overall route; the plan explains the approach; the programme lists the procedures. All three can change when new evidence appears.',
      hinglish: 'Strategy overall route hai; plan approach detail karta hai; programme procedures ki list deta hai. New evidence aaye toh teeno update ho sakte hain.',
      hindi: 'Strategy overall दिशा है; plan approach बताता है; programme procedures की सूची देता है। नया evidence मिलने पर तीनों बदल सकते हैं।',
    },
    quiz: {
      english: 'An audit programme was fixed at the planning meeting, but a new revenue system was introduced mid-year. Explain why continuing the old programme without reassessment would be inappropriate.',
      hinglish: 'Planning ke baad mid-year new revenue system aa gaya, par audit team old programme hi follow kar rahi hai. Bina reassessment aisa karna wrong kyun hai?',
      hindi: 'Planning के बाद mid-year नया revenue system लागू हुआ, लेकिन audit team पुराना programme ही follow कर रही है। बिना reassessment ऐसा करना उचित क्यों नहीं है?',
    },
  },
  {
    chapterNumber: 3, title: 'Risk Assessment and Internal Control',
    aliases: ['risk assessment and internal control', 'audit risk', 'inherent risk', 'control risk', 'detection risk', 'internal control', 'risk of material misstatement', 'fraud risk', 'जोखिम मूल्यांकन', 'आंतरिक नियंत्रण'],
    answer: {
      english: 'Audit risk is the risk that the auditor expresses an inappropriate opinion when the financial statements are materially misstated. A commonly taught model describes audit risk through inherent risk, control risk and detection risk; it is a conceptual aid, not a substitute for the applicable standard’s risk-assessment requirements. Inherent risk arises from the nature of an assertion before considering controls; control risk is the possibility that the entity’s controls fail to prevent, detect or correct a misstatement; detection risk relates to the auditor’s procedures not detecting a misstatement that exists. The auditor obtains an understanding of relevant controls, evaluates their design and implementation, and decides whether to test operating effectiveness. Internal control includes the control environment, entity risk assessment, information systems and communication, control activities, and monitoring. Weak controls may require more persuasive substantive evidence. Fraud risk factors, management override, estimates, unusual transactions and related parties need heightened professional scepticism.',
      hinglish: 'Audit risk woh risk hai jahan auditor materially misstated statements par inappropriate opinion de de. Teaching model mein inherent, control aur detection risk concepts hote hain; ye conceptual aid hai, standard requirements ka substitute nahi. Inherent risk assertion ki nature se; control risk entity controls fail hone se; detection risk auditor procedures misstatement detect na kar paane se. Auditor relevant controls samajhta, design/implementation evaluate karta aur operating effectiveness testing decide karta hai. Internal control mein control environment, risk assessment, information system/communication, control activities aur monitoring aate hain. Weak controls par stronger substantive evidence chahiye. Fraud indicators, management override, estimates aur unusual transactions par scepticism rakho.',
      hindi: 'Audit risk वह risk है जिसमें auditor materially misstated statements पर inappropriate opinion दे सकता है। Teaching model में inherent, control और detection risk की अवधारणाएँ हैं; यह conceptual aid है, applicable standards का विकल्प नहीं। Inherent risk assertion की nature से, control risk entity controls की failure संभावना से और detection risk auditor procedures की misstatement detect न कर पाने से संबंधित है। Auditor controls का design तथा implementation समझता है और operating effectiveness testing तय करता है। Internal control में control environment, risk assessment, information system, control activities और monitoring शामिल हैं।',
    },
    example: {
      english: 'Inventory is stored at many remote locations and includes obsolete models. This may increase inherent risk in valuation and existence. If cycle counts are poorly reviewed, control risk may also be high. The auditor may attend physical counts at selected locations, test ageing and subsequent sales, and expand substantive procedures.',
      hinglish: 'Inventory multiple remote sites par hai aur obsolete models hain—valuation/existence inherent risk high. Cycle counts review weak hai toh control risk bhi high. Auditor selected count attend karega, ageing/subsequent sales test karega aur substantive work expand karega.',
      hindi: 'Inventory कई remote sites पर है और obsolete models भी हैं; valuation तथा existence inherent risk बढ़ सकता है। Cycle counts की review कमजोर हो तो control risk भी बढ़ेगा। Auditor selected counts attend करेगा और ageing तथा subsequent sales test करेगा।',
    },
    simpler: {
      english: 'Risk assessment asks where a material mistake could happen, whether the company’s controls address it, and what the auditor must do to obtain enough evidence.',
      hinglish: 'Risk assessment dekhta hai material mistake kahan ho sakti hai, company controls use rok rahe hain ya nahi, aur auditor ko kaunsa evidence lena hoga.',
      hindi: 'Risk assessment देखता है कि material mistake कहाँ हो सकती है, company controls उसे रोकते हैं या नहीं और auditor को कौन-सा evidence लेना चाहिए।',
    },
    quiz: {
      english: 'A company has strong purchase authorisation but no independent review of inventory obsolescence. Identify the assertion most exposed and explain what control and substantive responses may be relevant.',
      hinglish: 'Purchase authorisation strong hai lekin inventory obsolescence ki independent review nahi hoti. Kaunsi assertion exposed hai aur audit response kya ho sakta hai?',
      hindi: 'Purchase authorisation मजबूत है लेकिन inventory obsolescence की independent review नहीं होती। कौन-सी assertion प्रभावित होगी और audit response क्या हो सकता है?',
    },
  },
  {
    chapterNumber: 4, title: 'Audit Evidence',
    aliases: ['audit evidence', 'sufficiency and appropriateness', 'audit procedures', 'external confirmation', 'analytical procedures', 'inspection observation inquiry', 'recalculation reperformance', 'audit sampling', 'ऑडिट एविडेंस', 'लेखापरीक्षा साक्ष्य'],
    answer: {
      english: 'Audit evidence is the information used by the auditor to reach conclusions. Sufficiency concerns quantity; appropriateness concerns quality, including relevance and reliability. More evidence does not automatically compensate for poor-quality evidence. Procedures include inspection, observation, external confirmation, recalculation, reperformance, analytical procedures and inquiry, often combined. Evidence obtained directly by the auditor and from independent external sources is generally more reliable than internally generated information, but reliability depends on circumstances and controls over its preparation. Inquiry alone is rarely enough to support a significant conclusion. Analytical procedures assess plausible relationships and investigate unexpected differences. Sampling allows conclusions about a population from selected items, with sample design and evaluation matched to the audit objective. Evidence should address relevant assertions and contradictory evidence must be investigated rather than ignored.',
      hinglish: 'Audit evidence woh information hai jisse auditor conclusion banata hai. Sufficiency quantity hai; appropriateness quality—relevance aur reliability. Zyada weak evidence poor-quality evidence ka automatic substitute nahi. Procedures: inspection, observation, external confirmation, recalculation, reperformance, analytical procedures aur inquiry; often combination. Direct auditor evidence aur independent external evidence generally stronger ho sakta hai, but circumstances/control matter karte hain. Inquiry alone significant conclusion ke liye rarely enough. Sampling population par conclusion ke liye selected items use karta hai. Contradictory evidence ignore nahi, investigate karo.',
      hindi: 'Audit evidence वह information है जिसके आधार पर auditor conclusions बनाता है। Sufficiency quantity है; appropriateness quality है, जिसमें relevance और reliability आती है। अधिक evidence खराब quality की भरपाई अपने-आप नहीं करता। Procedures में inspection, observation, external confirmation, recalculation, reperformance, analytical procedures और inquiry शामिल हैं। Direct तथा independent external evidence सामान्यतः अधिक reliable हो सकता है, लेकिन परिस्थितियाँ और information पर controls भी महत्त्वपूर्ण हैं। Inquiry अकेले significant conclusion के लिए पर्याप्त नहीं होती। Contradictory evidence की जाँच आवश्यक है।',
    },
    example: {
      english: 'To test a receivable balance, the auditor may send confirmations, inspect subsequent receipts, examine invoices and dispatch evidence, test year-end cut-off and evaluate disputes. If confirmations are not returned, alternative procedures may be needed; silence is not positive confirmation.',
      hinglish: 'Receivable test ke liye auditor confirmation bhej sakta hai, subsequent receipt inspect, invoice/dispatch evidence check, cut-off test aur disputes evaluate kar sakta hai. Confirmation return na aaye toh alternative procedures chahiye; no response ko positive confirmation mat samjho.',
      hindi: 'Receivable test में auditor confirmation भेज सकता है, subsequent receipts देख सकता है, invoices/dispatch evidence inspect कर सकता है और cut-off test कर सकता है। Confirmation न लौटे तो alternative procedures चाहिए; no response positive confirmation नहीं है।',
    },
    simpler: {
      english: 'Evidence must be enough and good enough. Match the procedure to the assertion and investigate anything that does not agree.',
      hinglish: 'Evidence enough bhi hona chahiye aur reliable bhi. Assertion ke hisaab se procedure choose karo aur mismatch investigate karo.',
      hindi: 'Evidence पर्याप्त भी हो और reliable भी। Assertion के अनुसार procedure चुनें और mismatch की जाँच करें।',
    },
    quiz: {
      english: 'Management provides an internally prepared spreadsheet supporting a material estimate. Explain why merely receiving the spreadsheet may not be sufficient and identify corroborating procedures.',
      hinglish: 'Management material estimate ke liye internal spreadsheet deti hai. Sirf spreadsheet milna sufficient kyun nahi? Corroborating procedures batao.',
      hindi: 'Management material estimate के support में internal spreadsheet देती है। केवल spreadsheet मिलना पर्याप्त क्यों नहीं है? Corroborating procedures बताइए।',
    },
  },
  {
    chapterNumber: 5, title: 'Audit of Items of Financial Statements',
    aliases: ['audit of items of financial statements', 'audit of inventory', 'audit of cash', 'audit of property plant equipment', 'audit of receivables', 'audit of liabilities', 'financial statement assertions', 'audit assertions', 'वित्तीय विवरण मदों की लेखापरीक्षा'],
    answer: {
      english: 'Auditing financial-statement items means linking risks and audit evidence to assertions. Common assertions include existence, rights and obligations, completeness, accuracy, valuation/allocation, cut-off, classification and presentation. For assets, the auditor may test existence through physical inspection, rights through title or contract evidence, valuation through cost/impairment support and completeness through reconciliations or source-to-ledger testing. For liabilities, search for unrecorded liabilities using post-period payments, supplier statements and unmatched receiving reports. For revenue and expenses, test occurrence, completeness, accuracy and cut-off using contracts, invoices, dispatch/service evidence and subsequent credit notes. Procedures must be tailored to the item and risk; a single generic checklist is not enough. Estimates require evaluation of methods, assumptions, data and management bias. The auditor should also test presentation and disclosures under the applicable reporting framework.',
      hinglish: 'Financial statement items audit karte waqt risk ko assertions aur evidence se link karo. Assertions: existence, rights/obligations, completeness, accuracy, valuation, cut-off, classification, presentation. Assets mein physical inspection, title/contract, valuation support aur reconciliations; liabilities ke liye unrecorded liabilities search via subsequent payments/supplier statements; revenue/expenses ke liye contracts, invoices, dispatch/service proof aur credit notes test karo. Procedures item aur risk-specific honi chahiye. Estimates ke methods, assumptions, data aur management bias evaluate karo. Presentation/disclosure bhi test karo.',
      hindi: 'Financial-statement items की audit में risks को assertions और evidence से जोड़ा जाता है। मुख्य assertions हैं existence, rights and obligations, completeness, accuracy, valuation, cut-off, classification और presentation। Assets के लिए physical inspection, title/contract evidence तथा valuation support; liabilities के लिए subsequent payments और supplier statements से unrecorded liabilities; revenue/expenses के लिए contracts, invoices, dispatch/service evidence तथा credit notes test किए जा सकते हैं। Procedures item और risk के अनुसार हों। Estimates में methods, assumptions, data और management bias evaluate करें।',
    },
    example: {
      english: 'A year-end inventory balance may exist physically but be obsolete. Counting supports existence; ageing reports and post-year-end sales help assess valuation; purchase and production records support rights and completeness. One procedure does not prove every assertion.',
      hinglish: 'Inventory physically exist karta hai, par obsolete ho sakta hai. Counting existence support karegi; ageing aur subsequent sales valuation; purchase/production records rights aur completeness. Ek procedure sab assertions prove nahi karti.',
      hindi: 'Inventory physically मौजूद हो सकता है, लेकिन obsolete भी हो सकता है। Counting existence, ageing तथा later sales valuation, और purchase/production records rights तथा completeness को support करते हैं।',
    },
    simpler: {
      english: 'For each balance ask: does it exist, belong to the entity, include everything, have the right value, belong in the right period and have clear disclosure?',
      hinglish: 'Har balance par poochho: exist karta hai? Entity ka hai? Complete hai? Right value hai? Right period mein hai? Disclosure clear hai?',
      hindi: 'हर balance पर पूछें: क्या वह मौजूद है, entity का है, complete है, सही value पर है, सही period में है और disclosure उचित है?',
    },
    quiz: {
      english: 'Inventory records agree with the general ledger, but the warehouse contains slow-moving goods with no recent sales. Identify the assertion at risk and design evidence procedures.',
      hinglish: 'Inventory ledger match karta hai, lekin warehouse mein slow-moving goods hain aur recent sale nahi. Kaunsi assertion risk mein hai aur evidence procedures design karo.',
      hindi: 'Inventory records general ledger से match करते हैं, लेकिन warehouse में slow-moving goods हैं जिनकी recent sales नहीं हैं। कौन-सी assertion risk में है और कौन-सी procedures होंगी?',
    },
  },
  {
    chapterNumber: 6, title: 'Audit Documentation',
    aliases: ['audit documentation', 'audit working papers', 'working papers', 'audit file', 'audit trail', 'ऑडिट डॉक्यूमेंटेशन', 'लेखापरीक्षा कार्यपत्र'],
    answer: {
      english: 'Audit documentation is the record of procedures performed, evidence obtained and conclusions reached. It should enable an experienced auditor with no previous connection to the engagement to understand the nature, timing and extent of procedures, results, significant matters, conclusions and important professional judgements. Documentation normally identifies who performed the work and when, and who reviewed it and when. Timely preparation improves quality and facilitates review. Oral explanations alone do not adequately support work performed or conclusions reached. Documentation may include planning, risk assessments, schedules, confirmations, correspondence, analyses and final reports. The auditor should protect confidentiality and custody, and apply the retention and assembly requirements of the applicable standard, law and firm policy. Do not invent a retention period; verify the exact current requirement for the relevant engagement and attempt.',
      hinglish: 'Audit documentation procedures, evidence aur conclusions ka record hai. Experienced auditor jo engagement se pehle connected nahi tha, woh nature/timing/extent, results, significant matters, conclusions aur professional judgement samajh sake. Kisne work kiya/kab aur kisne review kiya/kab—record hona chahiye. Timely documentation review improve karta hai. Oral explanation alone sufficient support nahi. Planning, risk assessment, schedules, confirmations, correspondence aur analyses working papers ho sakte hain. Confidentiality, custody aur retention exact applicable standard/law/policy ke according rakho; fixed period guess mat karo.',
      hindi: 'Audit documentation audit procedures, प्राप्त evidence और conclusions का record है। ऐसा record होना चाहिए कि engagement से पहले असंबद्ध experienced auditor भी procedures का nature, timing और extent, results, significant matters, conclusions तथा professional judgements समझ सके। किसने work किया और कब, किसने review किया और कब—यह दर्ज होना चाहिए। Timely documentation review में मदद करता है। केवल oral explanation पर्याप्त support नहीं है। Confidentiality, custody और retention के लिए exact applicable standard तथा law देखें; retention period अनुमान से न लिखें।',
    },
    example: {
      english: 'A working paper records the population, selection method, sample items, evidence inspected, exceptions found, follow-up performed and conclusion. A note saying “checked and found okay” is not a sufficiently clear audit trail.',
      hinglish: 'Working paper mein population, sample selection, items, inspected evidence, exceptions, follow-up aur conclusion likho. “Checked, okay” likhna adequate audit trail nahi.',
      hindi: 'Working paper में population, sample selection, inspected evidence, exceptions, follow-up और conclusion लिखें। केवल “checked and found okay” पर्याप्त audit trail नहीं है।',
    },
    simpler: {
      english: 'Documentation is the audit’s evidence trail: what was done, what was found, who did/reviewed it and why the conclusion makes sense.',
      hinglish: 'Documentation audit ka evidence trail hai—kya kiya, kya mila, kisne kiya/review kiya aur conclusion kyun sahi hai.',
      hindi: 'Documentation audit का evidence trail है—क्या किया, क्या मिला, किसने किया/review किया और conclusion क्यों निकला।',
    },
    quiz: {
      english: 'A team completed detailed procedures but saved no working papers, relying on staff memory. Explain why this creates an audit-quality problem even if the final balance is correct.',
      hinglish: 'Team ne detailed procedures kiye par working papers save nahi kiye aur memory par depend kiya. Balance correct ho tab bhi audit-quality problem kyun hai?',
      hindi: 'Team ने detailed procedures किए, लेकिन working papers नहीं बनाए और staff memory पर निर्भर रही। Balance सही होने पर भी यह audit-quality problem क्यों है?',
    },
  },
  {
    chapterNumber: 7, title: 'Completion and Review',
    aliases: ['completion and review audit', 'audit completion', 'final analytical procedures', 'subsequent events audit', 'going concern audit', 'uncorrected misstatements', 'management representation letter', 'ऑडिट समापन', 'लेखापरीक्षा समीक्षा'],
    answer: {
      english: 'Completion procedures bring together evidence from individual audit areas to determine whether the financial statements as a whole are fairly presented under the applicable framework. The auditor evaluates uncorrected misstatements individually and in aggregate, reviews significant judgements and estimates, performs final analytical procedures, considers subsequent events and going-concern matters, obtains appropriate written representations and confirms that sufficient appropriate evidence has been obtained. Written representations support other evidence; they do not replace it. Subsequent events procedures focus on events between the reporting date and the auditor’s report date, with responsibilities after the report date governed by applicable requirements. Engagement quality review, where required, is separate from the engagement team’s own review and does not transfer responsibility away from the engagement partner. If evidence is insufficient or a material matter remains unresolved, the auditor must consider the effect on the report.',
      hinglish: 'Completion mein individual audit areas ka evidence combine karke full financial statements evaluate hote hain. Uncorrected misstatements individual + aggregate assess, significant judgements/estimates review, final analytical procedures, subsequent events aur going concern consider, written representations obtain, aur sufficient appropriate evidence confirm karo. Written representations supporting evidence hain, substitute nahi. Subsequent events reporting date se auditor report date ke beech focus karte hain. Required engagement quality review separate hai; responsibility engagement partner ki hi rahegi. Evidence insufficient ya unresolved material matter ho toh report impact consider karo.',
      hindi: 'Completion procedures में अलग-अलग audit areas के evidence को जोड़कर पूरे financial statements evaluate किए जाते हैं। Uncorrected misstatements individually और aggregate assess करें, significant estimates review करें, final analytical procedures करें, subsequent events तथा going concern पर विचार करें और appropriate written representations लें। Written representations अन्य evidence का support हैं, substitute नहीं। Insufficient evidence या unresolved material matter का report पर प्रभाव evaluate करें।',
    },
    example: {
      english: 'After year-end, a major customer enters insolvency. The auditor evaluates whether the event provides evidence about conditions existing at the reporting date or reflects a new condition, and whether recognition or disclosure is required under the applicable framework.',
      hinglish: 'Year-end ke baad major customer insolvent ho gaya. Auditor dekhega event reporting date par existing condition ka evidence hai ya new condition; applicable framework mein adjustment ya disclosure chahiye?',
      hindi: 'Year-end के बाद बड़ा customer insolvent हो गया। Auditor जाँचेगा कि यह reporting date पर existing condition का evidence है या नई condition, और adjustment/disclosure आवश्यक है या नहीं।',
    },
    simpler: {
      english: 'At completion, step back and ask whether all evidence fits together, unresolved errors matter, later events change the picture and the report can be supported.',
      hinglish: 'Completion par overall picture dekho: evidence consistent hai? Errors material hain? Later events matter karte hain? Report support ho sakti hai?',
      hindi: 'Completion पर overall picture देखें: evidence consistent है? Errors material हैं? बाद की घटनाएँ असर डालती हैं? Report को support किया जा सकता है?',
    },
    quiz: {
      english: 'Management refuses to correct an individually small misstatement, but similar items exist throughout the ledger. Explain why aggregate evaluation matters and what completion steps should follow.',
      hinglish: 'Management small misstatement correct nahi karti, par ledger mein similar items bahut hain. Aggregate evaluation kyun important hai aur completion steps kya honge?',
      hindi: 'Management एक individually small misstatement correct नहीं करती, लेकिन ledger में ऐसे कई items हैं। Aggregate evaluation क्यों जरूरी है और आगे कौन-से steps होंगे?',
    },
  },
  {
    chapterNumber: 8, title: 'Audit Report',
    aliases: ['audit report', 'audit opinion', 'qualified opinion', 'adverse opinion', 'disclaimer of opinion', 'emphasis of matter', 'other matter paragraph', 'key audit matters', 'ऑडिट रिपोर्ट', 'लेखापरीक्षा मत'],
    answer: {
      english: 'The audit report communicates the auditor’s conclusion in the format required by the applicable reporting framework and standards. An unmodified opinion is appropriate when the auditor concludes that the financial statements are prepared, in all material respects, under the applicable framework. A modified opinion may be qualified, adverse or a disclaimer depending on whether a material misstatement exists and whether its possible effects are pervasive, or whether sufficient appropriate evidence could be obtained. A qualified opinion is used for a material but not pervasive matter; an adverse opinion for material and pervasive misstatement; a disclaimer when possible effects of undetected misstatements may be material and pervasive because evidence is insufficient. The report also contains responsibilities, basis for opinion and other required sections. Emphasis of Matter and Other Matter paragraphs are not substitutes for modification when modification is required. Key Audit Matters apply only where the relevant reporting requirements call for them. Always verify exact report wording, thresholds and format against the current standard and entity context.',
      hinglish: 'Audit report auditor ka conclusion required format mein communicate karti hai. Unmodified opinion tab jab statements applicable framework ke under materially prepared hain. Modified opinion qualified, adverse ya disclaimer ho sakta hai—misstatement aur pervasiveness, ya evidence obtain na hone ke basis par. Qualified = material but not pervasive misstatement/evidence limitation; adverse = material and pervasive misstatement; disclaimer = insufficient evidence with possible material and pervasive effects. Report mein basis for opinion, responsibilities aur required sections aate hain. Emphasis of Matter/Other Matter modification ka substitute nahi. Key Audit Matters sirf jab applicable requirements kehte hain. Exact format/wording current standard se verify karo.',
      hindi: 'Audit report auditor का conclusion applicable framework और standards के format में communicate करती है। Unmodified opinion तब दी जाती है जब statements material respects में framework के अनुसार हों। Modified opinion qualified, adverse या disclaimer हो सकती है। Qualified opinion material लेकिन not pervasive misstatement या limitation के लिए; adverse material और pervasive misstatement के लिए; disclaimer तब जब sufficient evidence न मिले और possible effects material तथा pervasive हो सकते हों। Report में basis for opinion और responsibilities जैसी required sections होती हैं। Emphasis of Matter modification का विकल्प नहीं है। Exact format और wording current standard से verify करें।',
    },
    example: {
      english: 'A material inventory valuation error affects one limited balance and its effect is not pervasive: a qualified opinion may be appropriate. If the error undermines the financial statements broadly, an adverse opinion may be required. If the auditor cannot obtain evidence over a major area and possible effects are pervasive, a disclaimer may be considered.',
      hinglish: 'Inventory valuation error material hai but limited balance tak confined aur not pervasive—qualified possible. Error broadly statements ko affect kare toh adverse. Major area ka evidence nahi mila aur possible effect pervasive hai toh disclaimer consider ho sakta hai.',
      hindi: 'Inventory valuation error material लेकिन सीमित हो तो qualified opinion हो सकती है। व्यापक असर होने पर adverse opinion; major area पर evidence न मिलने और pervasive possible effects होने पर disclaimer consider किया जा सकता है।',
    },
    simpler: {
      english: 'The opinion depends on two questions: is there a material misstatement, and is its effect pervasive? If evidence is missing, assess the possible effects instead.',
      hinglish: 'Opinion do questions par depend karti hai: material misstatement hai? Pervasive hai? Evidence missing ho toh possible effects dekho.',
      hindi: 'Opinion दो प्रश्नों पर निर्भर है: material misstatement है? उसका असर pervasive है? Evidence न हो तो possible effects देखें।',
    },
    quiz: {
      english: 'A material misstatement is confined to one disclosure and does not affect the statements broadly. Explain why adverse opinion may not be the appropriate modification and what else must be assessed.',
      hinglish: 'Material misstatement ek disclosure tak limited hai aur broadly affect nahi karta. Adverse opinion kyun suitable nahi ho sakti aur aur kya assess karoge?',
      hindi: 'एक material misstatement केवल एक disclosure तक सीमित है और statements को व्यापक रूप से प्रभावित नहीं करता। Adverse opinion क्यों उपयुक्त नहीं हो सकती और क्या assess करेंगे?',
    },
  },
  {
    chapterNumber: 9, title: 'Special Features of Audit of Different Type of Entities',
    aliases: ['special features audit different type of entities', 'audit of different entities', 'audit of not for profit organisations', 'audit of charitable institutions', 'audit of educational institutions', 'audit of hospitals', 'audit of trusts', 'विभिन्न संस्थाओं की लेखापरीक्षा'],
    answer: {
      english: 'Different entities create different audit risks because their objectives, funding, governance, transaction patterns and reporting requirements differ. A not-for-profit entity may rely on donations, grants, subscriptions and restricted funds; the auditor considers donor restrictions, utilisation evidence, receipts and expenditure authorisations. An educational institution may have fee collections, scholarships, hostel operations and fixed-asset controls. A hospital may have patient billing, pharmacy inventory, insurance claims and sensitive data. A cooperative, club, trust or other entity may be subject to special governing documents and legal requirements. The auditor should understand the entity’s constitution, governing rules, revenue streams, control environment, related parties and applicable reporting basis. Do not assume a general commercial-company checklist covers every special requirement. The exact legal duties, reporting formats, eligibility and audit appointment provisions must be verified from current primary sources for the entity type and relevant period.',
      hinglish: 'Different entities ke objectives, funding, governance aur transactions alag hote hain, isliye audit risks bhi different. NPO mein donations, grants, subscriptions aur restricted funds; auditor utilisation aur donor restrictions check karega. Educational institute mein fees, scholarships, hostel aur fixed assets. Hospital mein patient billing, pharmacy inventory, insurance claims aur sensitive data. Trust/club/cooperative ke governing documents aur legal rules alag ho sakte hain. Entity constitution, revenue, controls, related parties aur reporting basis samjho. General company checklist har special requirement cover nahi karti. Exact legal duties/report format current primary source se verify karo.',
      hindi: 'अलग-अलग entities के objectives, funding, governance और transactions अलग होते हैं, इसलिए audit risks भी अलग होते हैं। NPO में donations, grants, subscriptions तथा restricted funds; educational institution में fees, scholarships और hostel; hospital में patient billing, pharmacy inventory और insurance claims महत्त्वपूर्ण हो सकते हैं। Trust, club या cooperative के governing documents तथा legal requirements अलग हो सकते हैं। Entity की constitution, revenue streams, controls, related parties और reporting basis समझें। Exact legal duties तथा reporting format current primary sources से verify करें।',
    },
    example: {
      english: 'A charity receives a grant restricted to rural health equipment. The auditor should verify receipt, grant conditions, procurement, asset existence and use for the stated purpose. A normal sales-cut-off test would not address the key grant-compliance risk by itself.',
      hinglish: 'Charity ko rural health equipment ke liye restricted grant milti hai. Auditor receipt, grant conditions, procurement, asset existence aur stated purpose mein use verify karega. Normal sales cut-off test alone main risk cover nahi karta.',
      hindi: 'Charity को rural health equipment के लिए restricted grant मिलती है। Auditor receipt, grant conditions, procurement, asset existence और stated purpose में उपयोग verify करेगा। केवल sales cut-off test पर्याप्त नहीं।',
    },
    simpler: {
      english: 'First understand what kind of entity it is, where its money comes from, what rules govern it and what risks are unique to its activities.',
      hinglish: 'Pehle entity ka type, funding source, governing rules aur activity-specific risks samjho.',
      hindi: 'पहले entity का प्रकार, funding source, governing rules और उसके कार्यों से जुड़े विशेष risks समझें।',
    },
    quiz: {
      english: 'A trust receives donations restricted to a specific programme but uses part of the money for administration. Identify the audit risks and evidence needed before reaching a conclusion.',
      hinglish: 'Trust ko specific programme ke liye restricted donation milti hai, par kuch funds admin mein use hote hain. Audit risks aur required evidence batao.',
      hindi: 'एक trust को specific programme के लिए restricted donation मिली, लेकिन कुछ funds administration में उपयोग हुए। Audit risks और आवश्यक evidence बताइए।',
    },
  },
  {
    chapterNumber: 10, title: 'Audit of Banks',
    aliases: ['audit of banks', 'bank audit', 'audit of advances', 'bank deposits audit', 'non performing assets', 'npa audit', 'bank branch audit', 'बैंकों की लेखापरीक्षा', 'बैंक ऑडिट'],
    answer: {
      english: 'Bank audits involve specialised risks arising from high transaction volumes, extensive IT systems, public deposits, advances, treasury activities, regulatory requirements and branch networks. The auditor considers controls over account opening, customer due diligence, transaction authorisation, access rights, reconciliations, suspense accounts and system interfaces. For advances, areas include sanction and documentation, security, monitoring, renewals, recovery, classification and provisioning under the applicable regulatory framework. For deposits, the auditor considers completeness, interest calculation, dormant or unusual accounts and reconciliation. Income recognition, investment valuation, inter-branch balances and regulatory returns may require specialist procedures. Bank-specific classifications, provisioning rates, prudential norms and reporting obligations are time-sensitive; never insert a rate or regulatory rule from memory. Confirm the exact RBI/ICAI circular, effective date, audit period and applicable examination material before giving a statutory conclusion.',
      hinglish: 'Bank audit mein high transaction volume, IT systems, public deposits, advances, treasury, regulation aur branch network ke risks hote hain. Account opening/KYC, authorisation, access, reconciliations, suspense accounts aur system interfaces check karo. Advances mein sanction, documentation, security, monitoring, recovery, classification/provisioning; deposits mein completeness, interest, dormant accounts aur reconciliation. Income recognition, investments, inter-branch balances aur regulatory returns bhi important. NPA classification, provisioning rates aur RBI norms time-sensitive hain—memory se rate mat bolo. Exact RBI/ICAI circular, effective date aur audit period verify karo.',
      hindi: 'Bank audit में high transaction volumes, IT systems, public deposits, advances, treasury, regulation और branch networks के विशेष risks होते हैं। Account opening, KYC, authorisation, access rights, reconciliations और suspense accounts देखे जाते हैं। Advances में sanction, documentation, security, monitoring, recovery, classification और provisioning; deposits में completeness, interest calculation तथा reconciliation महत्त्वपूर्ण हैं। NPA classification, provisioning rates और prudential norms time-sensitive हैं; कोई rate memory से न दें। Exact RBI/ICAI circular, effective date और audit period verify करें।',
    },
    example: {
      english: 'A loan account shows regular interest credits, but borrower financial information is outdated and instalments are overdue. The auditor should not rely only on system-generated interest entries; assess the loan file, subsequent receipts, security valuation and classification under the applicable current framework.',
      hinglish: 'Loan account mein regular interest credit dikh raha hai, lekin borrower info outdated aur instalments overdue hain. Sirf system interest entry par rely mat karo; loan file, subsequent receipts, security valuation aur applicable classification assess karo.',
      hindi: 'Loan account में regular interest credit दिख रहा है, लेकिन borrower information पुरानी है और instalments overdue हैं। केवल system entries पर भरोसा न करें; loan file, subsequent receipts, security valuation और current classification जाँचें।',
    },
    simpler: {
      english: 'Bank audit checks both the huge flow of transactions and the quality of major assets, especially loans. Regulatory rates and classifications must be current.',
      hinglish: 'Bank audit transaction flow ke saath loans jaise major assets ki quality check karta hai. Regulatory rates/classification current source se hi lo.',
      hindi: 'Bank audit transactions के flow और loans जैसे major assets की quality जाँचता है। Regulatory rates तथा classifications current source से ही लें।',
    },
    quiz: {
      english: 'A bank’s loan system classifies an account as regular, but independent evidence shows repeated overdue instalments and weak security. Explain the audit response and why the system label is not conclusive.',
      hinglish: 'Bank system loan ko regular bolta hai, lekin repeated overdue instalments aur weak security evidence hai. Audit response kya hoga? System label conclusive kyun nahi?',
      hindi: 'Bank system loan को regular दिखाता है, लेकिन repeated overdue instalments और weak security का evidence है। Audit response क्या होगा और system label conclusive क्यों नहीं है?',
    },
  },
  {
    chapterNumber: 11, title: 'Ethics and Terms of Audit Engagements',
    aliases: ['ethics and terms of audit engagements', 'audit ethics', 'fundamental principles of ethics', 'independence of auditor', 'ethical threats', 'self interest threat', 'self review threat', 'advocacy threat', 'familiarity threat', 'intimidation threat', 'engagement letter', 'terms of engagement', 'ऑडिट एथिक्स', 'लेखापरीक्षा नियुक्ति की शर्तें'],
    answer: {
      english: 'Professional ethics supports public trust in assurance work. The fundamental principles commonly studied include integrity, objectivity, professional competence and due care, confidentiality and professional behaviour. Independence requirements apply to relevant assurance engagements and must be assessed in both appearance and fact under the applicable Code. Threat categories commonly include self-interest, self-review, advocacy, familiarity and intimidation. Identify the circumstance, evaluate whether the threat is at an acceptable level, and apply appropriate safeguards or decline/withdraw where the framework requires. Do not assume a safeguard can cure every prohibited situation. Before accepting or continuing an audit, consider whether the preconditions for an audit exist, whether management acknowledges its responsibilities, whether the reporting framework is acceptable and whether the auditor can comply with ethical requirements. The engagement letter records the agreed objective and scope, responsibilities, applicable framework and expected form of reporting. Exact Code paragraphs, prohibitions and engagement requirements must be checked against the current ICAI Code and applicable rules.',
      hinglish: 'Professional ethics assurance par public trust banati hai. Fundamental principles: integrity, objectivity, professional competence and due care, confidentiality, professional behaviour. Relevant assurance engagements mein independence fact aur appearance dono mein assess hoti hai. Threats: self-interest, self-review, advocacy, familiarity, intimidation. Circumstance identify karo, threat acceptable level par hai ya nahi evaluate, safeguards apply karo ya prohibited situation mein decline/withdraw. Har threat safeguard se cure nahi hota. Audit accept/continue karne se pehle preconditions, management responsibilities, acceptable framework aur ethical compliance check karo. Engagement letter objective/scope, responsibilities, framework aur reporting expectations record karta hai. Exact Code provisions current ICAI Code se verify karo.',
      hindi: 'Professional ethics assurance पर public trust बनाती है। Fundamental principles में integrity, objectivity, professional competence and due care, confidentiality तथा professional behaviour शामिल हैं। Relevant engagements में independence को fact और appearance दोनों में assess किया जाता है। Threats में self-interest, self-review, advocacy, familiarity और intimidation आते हैं। Circumstance identify करें, threat का level evaluate करें और safeguards लागू करें; prohibited situation में decline/withdraw करना पड़ सकता है। Audit accept/continue करने से पहले preconditions, management responsibilities और acceptable framework जाँचें। Engagement letter objective, scope, responsibilities और reporting expectations record करता है। Exact Code provisions current ICAI Code से verify करें।',
    },
    example: {
      english: 'An audit firm is asked to audit financial statements that its own team prepared. This creates a self-review threat. The team should evaluate the applicable independence rules, whether safeguards are permitted and sufficient, and whether the engagement must be declined. Simply assigning another team member may not cure a prohibited circumstance.',
      hinglish: 'Audit firm ko wahi statements audit karne ko bola gaya jo uski team ne prepare kiye. Self-review threat create hota hai. Independence rules, safeguards allowed/sufficient hain ya nahi aur engagement decline karna hai ya nahi assess karo. Sirf staff change karna har prohibited situation cure nahi karta.',
      hindi: 'जिस audit firm की team ने financial statements तैयार किए, उसी से audit माँगा गया। Self-review threat पैदा होता है। Applicable independence rules और safeguards assess करें; कुछ स्थितियों में engagement decline करना आवश्यक हो सकता है।',
    },
    simpler: {
      english: 'Ethics asks whether the auditor is honest, objective, competent, confidential and independent. The engagement letter makes the agreed audit responsibilities and scope clear.',
      hinglish: 'Ethics check karti hai auditor honest, objective, competent, confidential aur independent hai ya nahi. Engagement letter scope aur responsibilities clear karta hai.',
      hindi: 'Ethics जाँचती है कि auditor honest, objective, competent, confidential और independent है या नहीं। Engagement letter scope और responsibilities स्पष्ट करता है।',
    },
    quiz: {
      english: 'An audit partner has a close family relationship with the finance director of the audit client. Identify the likely ethical threat and explain what must be checked before deciding whether safeguards are adequate.',
      hinglish: 'Audit partner ka client ke finance director ke saath close family relation hai. Likely ethical threat identify karo aur safeguards sufficient hain ya nahi decide karne se pehle kya check hoga?',
      hindi: 'Audit partner का audit client के finance director से close family relationship है। संभावित ethical threat identify करें और safeguards की adequacy तय करने से पहले क्या जाँचना होगा?',
    },
  },
];

export const PARAKH_AUDIT_BENCHMARKS = CHAPTERS.flatMap((chapter) => {
  const items = [
    ['core_concept', 'Explain the key concepts and audit objective in ' + chapter.title + '.'],
    ['unseen_case_application', 'Apply ' + chapter.title + ' to a new audit case and justify the evidence or response.'],
    ['exam_style_answer', 'Prepare a structured CA Intermediate exam-style answer on ' + chapter.title + '.'],
    ['edge_case_and_professional_judgement', 'Analyse a difficult exception, evidence conflict or professional judgement issue in ' + chapter.title + '.'],
    ['attempt_source_sensitivity', 'Verify the applicable audit standard, ethics rule and chapter treatment for the exact examination attempt in ' + chapter.title + '.'],
  ] as const;
  return items.map(([family, question], index) => ({
    id: 'intermediate-audit-chapter-' + chapter.chapterNumber + '-' + (index + 1),
    chapterNumber: chapter.chapterNumber,
    family,
    question,
  }));
});

export type ParakhAuditMatch = {
  topicId: string;
  topicTitle: string;
  course: 'CA_INTERMEDIATE';
  paperCode: 'INT-G2-P5';
  section: 'Auditing and Ethics';
  chapterNumber: number;
  syllabusApplicability: string;
  contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';
  benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED';
  mode: ParakhAuditMode;
  answer: string;
  source: { title: string; url: string };
};

function normalize(value: string): string {
  return String(value || '').toLocaleLowerCase('en-IN')
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchMode(message: string): ParakhAuditMode {
  if (/\b(quiz|test me|ask me|practice question)\b|प्रश्नोत्तरी|टेस्ट लो|सवाल पूछो/i.test(message)) return 'quiz';
  if (/\b(example|illustrate|case study|for example)\b|उदाहरण|मिसाल/i.test(message)) return 'example';
  if (/\b(simple|simpler|easy language|in simple words)\b|आसान भाषा|सरल भाषा/i.test(message)) return 'simpler';
  return 'answer';
}

function isAttemptSensitive(message: string): boolean {
  return /\b(latest|most recent|amendment|amended|corrigendum|applicable for|upcoming attempt|my attempt|exact syllabus|new syllabus|may 2027|september 2027|january 2028|current standard|current code)\b/i.test(message);
}

export function searchParakhAuditingKnowledge(input: {
  message: string;
  course: string;
  language: ParakhAuditLanguage;
}): ParakhAuditMatch | null {
  const message = String(input.message || '').trim();
  if (!message || input.course !== 'CA_INTERMEDIATE' || isAttemptSensitive(message)) return null;
  const normalized = ' ' + normalize(message) + ' ';
  const chapter = CHAPTERS.find((item) => item.aliases.some((alias) => {
    const needle = normalize(alias);
    return needle && normalized.includes(' ' + needle + ' ');
  }));
  if (!chapter) return null;
  const mode = matchMode(message);
  return {
    topicId: 'intermediate-audit-chapter-' + chapter.chapterNumber,
    topicTitle: chapter.title,
    course: 'CA_INTERMEDIATE',
    paperCode: 'INT-G2-P5',
    section: 'Auditing and Ethics',
    chapterNumber: chapter.chapterNumber,
    syllabusApplicability: PARAKH_AUDIT_APPLICABILITY,
    contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
    mode,
    answer: chapter[mode][input.language],
    source: {
      title: 'ICAI Intermediate Paper 5: Auditing and Ethics — applicable for May 2027 exam onwards',
      url: PARAKH_AUDIT_SOURCE_URL,
    },
  };
}

export function buildParakhAuditingReply(result: ParakhAuditMatch, language: ParakhAuditLanguage): string {
  const heading = language === 'hindi' ? 'अध्याय' : 'Chapter';
  const applicability = language === 'hinglish'
    ? '\n\n**Syllabus source:** ICAI ki official Paper 5 page May 2027 exam onwards ke liye ye chapter list karti hai. Exact attempt different ho toh material recheck karo.'
    : language === 'hindi'
      ? '\n\n**पाठ्यक्रम स्रोत:** ICAI की official Paper 5 page May 2027 exam onwards के लिए यह chapter list करती है। अलग attempt हो तो material दोबारा जाँचें।'
      : '\n\n**Syllabus source:** ICAI’s official Paper 5 page lists this chapter for May 2027 exams onwards. Recheck if your attempt differs.';
  const review = language === 'hinglish'
    ? '\n\n**Content status:** Ye original PARAKH author draft hai, qualified audit academic reviewer ne independently verify nahi kiya. SA/Code of Ethics ki exact applicability current ICAI source aur attempt se check karo.'
    : language === 'hindi'
      ? '\n\n**Content status:** यह original PARAKH author draft है; qualified audit academic reviewer ने independently verify नहीं किया है। SA और Code of Ethics की exact applicability current ICAI source तथा attempt से जाँचें।'
      : '\n\n**Content status:** This is an original PARAKH author draft and has not been independently verified by a qualified audit academic reviewer. Check SA and Code of Ethics applicability against current ICAI sources and the exact attempt.';
  return '**' + heading + ' ' + result.chapterNumber + ': ' + result.topicTitle + '**\n\n'
    + result.answer + applicability + review;
}

export function getParakhAuditingInventory() {
  return {
    course: 'CA_INTERMEDIATE' as const,
    paperCode: 'INT-G2-P5' as const,
    paperTitle: 'Auditing and Ethics',
    sourceCheckedAt: '2026-11-08',
    sourceUrl: PARAKH_AUDIT_SOURCE_URL,
    syllabusApplicability: PARAKH_AUDIT_APPLICABILITY,
    chapterCount: CHAPTERS.length,
    authoredContentCount: CHAPTERS.length,
    humanReviewedContentCount: 0 as const,
    benchmarkCaseCount: PARAKH_AUDIT_BENCHMARKS.length,
    humanReviewedBenchmarkCount: 0 as const,
    chapters: CHAPTERS.map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      module: chapter.chapterNumber <= 5 ? 'Module 1' : 'Module 2',
      units: [] as string[],
      contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' as const,
      benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' as const,
    })),
    limitations: [
      'Official ICAI catalogue is headed Applicable for May 2027 Exam Onwards; confirm exact attempt edition.',
      'Eleven original chapter drafts exist in English, Hindi and Hinglish; none is human-reviewed.',
      'Fifty-five benchmark prompts are defined but have no approved answer keys and have not been evaluated.',
      'Exact Standards on Auditing, reporting formats, ethics provisions and bank regulatory requirements must be checked against current primary sources.',
    ],
  };
}
