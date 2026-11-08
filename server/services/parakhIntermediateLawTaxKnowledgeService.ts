export type ParakhIntermediateLawTaxLanguage = 'english' | 'hindi' | 'hinglish';
export type ParakhIntermediateLawTaxMode = 'answer' | 'example' | 'simpler' | 'quiz';

type Localized = Record<ParakhIntermediateLawTaxLanguage, string>;
type PackKey = 'corporate_law' | 'income_tax' | 'gst';
type ChapterDraft = {
  key: string;
  pack: PackKey;
  chapterNumber: number;
  title: string;
  section: string;
  aliases: string[];
  answer: Localized;
  example: Localized;
  quiz: Localized;
};

export const PARAKH_INTERMEDIATE_LAW_SOURCE_URL = 'https://www.icai.org/post/24331';
export const PARAKH_INTERMEDIATE_INCOME_TAX_SOURCE_URL = 'https://www.icai.org/post/24313';
export const PARAKH_INTERMEDIATE_GST_SOURCE_URL = 'https://www.icai.org/post/24360';
export const PARAKH_INTERMEDIATE_LAW_TAX_APPLICABILITY =
  'ICAI catalogue pages list these materials for May 2027, September 2027 and January 2028 examinations (Paper 2 page: May 2027 onwards). Confirm the exact attempt edition, statutory update, RTP, corrigendum, exclusions and effective dates before applying any provision.';

const CHAPTERS: ChapterDraft[] = [
  // Paper 2: Corporate and Other Laws — Part I: Company Law and LLP Law
  {
    key: 'law-preliminary', pack: 'corporate_law', chapterNumber: 1, title: 'Preliminary',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['preliminary company law', 'company law preliminary', 'company legal framework', 'company meaning', 'corporate and other laws preliminary'],
    answer: {
      english: 'Begin every company-law problem by identifying the entity, the relevant legal source and the facts that trigger the provision. The Companies Act framework distinguishes a company from its members, directors and officers; it also uses defined expressions whose statutory meaning controls over ordinary-language meaning. Questions commonly test classification, incorporation status, membership, control and the difference between a company and other business forms. Read the definition and any applicable exception together, then apply the facts rather than relying on a label such as private, public, holding or subsidiary in isolation.',
      hinglish: 'Company-law question solve karne se pehle entity, applicable legal source aur facts identify karo. Company apne members, directors aur officers se separate legal person hoti hai; Act ke defined words ka statutory meaning ordinary meaning se control karta hai. Classification, incorporation status, membership, control aur company vs other business forms ke differences test ho sakte hain. Definition ke saath exceptions bhi padho aur facts apply karo.',
      hindi: 'Company law के प्रश्न में पहले entity, लागू legal source और provision को trigger करने वाले facts पहचानें। Company अपने members, directors और officers से अलग legal person होती है। Act में defined expressions का statutory meaning सामान्य अर्थ से अधिक महत्वपूर्ण होता है। Classification, incorporation status, membership, control तथा company और अन्य business forms के अंतर को facts पर लागू करके समझें।',
    },
    example: {
      english: 'A business uses the word “limited” on its invoices but has never been incorporated. Do not assume that the label creates a company; verify registration and the legal form before applying company-law consequences.',
      hinglish: 'Business invoices par “limited” likhta hai, lekin incorporation nahi hua. Sirf label se company create nahi hoti; pehle registration aur legal form verify karo.',
      hindi: 'एक business invoices पर “limited” लिखता है, लेकिन incorporation नहीं हुआ। केवल नाम से company नहीं बनती; पहले registration और legal form verify करें।',
    },
    quiz: {
      english: 'A question describes a business as a company but gives facts suggesting it is only a partnership. Which facts and legal records would you verify before answering?',
      hinglish: 'Question business ko company bolta hai, par facts partnership suggest karte hain. Answer dene se pehle kaunse facts aur legal records verify karoge?',
      hindi: 'प्रश्न business को company बताता है, लेकिन facts partnership दर्शाते हैं। उत्तर देने से पहले कौन-से facts और legal records verify करेंगे?',
    },
  },
  {
    key: 'law-incorporation', pack: 'corporate_law', chapterNumber: 2, title: 'Incorporation of Company and Matters Incidental Thereto',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['incorporation of company', 'company incorporation', 'promoters and incorporation', 'memorandum of association', 'articles of association', 'registered office', 'commencement of business'],
    answer: {
      english: 'Incorporation is the legal process by which the proposed company becomes a body corporate with a separate identity. The application requires prescribed constitutional documents, declarations, particulars and filings; the certificate and registration record are central evidence of incorporation. The memorandum states the company’s fundamental constitution and objects, while the articles regulate internal management subject to the Act. Promoters organise the formation and may owe duties in relation to disclosure and pre-incorporation arrangements. Do not assume every procedural filing, commencement condition or promoter liability is identical for every company category.',
      hinglish: 'Incorporation woh legal process hai jisse proposed company separate body corporate ban jaati hai. Application mein prescribed constitutional documents, declarations, details aur filings hoti hain; certificate aur registration record important proof hain. Memorandum company ka fundamental constitution/object batata hai, Articles internal management regulate karte hain subject to Act. Promoters formation organise karte hain aur pre-incorporation dealings mein duties/liability aa sakti hai.',
      hindi: 'Incorporation वह legal process है जिससे proposed company अलग body corporate बनती है। Application में निर्धारित constitutional documents, declarations, particulars और filings शामिल होते हैं; certificate तथा registration record महत्वपूर्ण evidence हैं। Memorandum company का मूल constitution और objects बताता है, जबकि Articles internal management नियंत्रित करते हैं। Promoters formation organise करते हैं और pre-incorporation arrangements में duties या liability उत्पन्न हो सकती है।',
    },
    example: {
      english: 'Three founders submit incorporation documents and receive a certificate. A supplier contracted with one founder before incorporation; analyse that contract separately instead of automatically treating the new company as the original contracting party.',
      hinglish: 'Teen founders documents file karke certificate lete hain. Incorporation se pehle ek founder ne supplier se contract kiya tha; use automatically company ka contract mat mano—pre-incorporation position separately analyse karo.',
      hindi: 'तीन founders documents file करके certificate प्राप्त करते हैं। Incorporation से पहले एक founder ने supplier से contract किया था; उसे स्वतः company का contract न मानें और pre-incorporation position अलग जाँचें।',
    },
    quiz: {
      english: 'A promoter signs a supply contract before the company is incorporated. Identify the issues that must be analysed before deciding who is bound.',
      hinglish: 'Promoter company incorporate hone se pehle supply contract sign karta hai. Decide karo kaun bound hoga—isse pehle kaunse issues analyse karne hain?',
      hindi: 'Promoter company के incorporation से पहले supply contract sign करता है। यह तय करने से पहले किन issues का analysis आवश्यक है कि कौन bound होगा?',
    },
  },
  {
    key: 'law-prospectus', pack: 'corporate_law', chapterNumber: 3, title: 'Prospectus and Allotment of Securities',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['prospectus', 'allotment of securities', 'public offer', 'private placement', 'offer for sale', 'misstatement in prospectus', 'securities allotment'],
    answer: {
      english: 'A prospectus or other offer document communicates material information to prospective investors. The legal analysis focuses on the type of offer, permitted route, required disclosures, responsibility for statements, application of subscription money and valid allotment. A public offer, private placement and offer for sale are not interchangeable labels; each has its own conditions and compliance trail. A misleading statement or omission may create civil, criminal or regulatory consequences depending on the facts and applicable law. In an exam answer, state the offer route first, then test disclosure, authorisation, timing and allotment requirements.',
      hinglish: 'Prospectus/offer document investors ko material information deta hai. Analysis mein offer ka type, permitted route, disclosure, statements ki responsibility, subscription money ka use aur valid allotment check karo. Public offer, private placement aur offer for sale same nahi hain. Misstatement ya omission se facts aur applicable law ke basis par civil, criminal ya regulatory consequences ho sakte hain.',
      hindi: 'Prospectus या अन्य offer document prospective investors को material information देता है। Analysis में offer का प्रकार, permitted route, disclosures, statements की responsibility, subscription money का उपयोग और valid allotment जाँचे जाते हैं। Public offer, private placement और offer for sale अलग routes हैं। Misstatement या omission से facts तथा लागू law के अनुसार civil, criminal या regulatory consequences हो सकते हैं।',
    },
    example: {
      english: 'An offer document omits a material pending dispute that could influence an investor. Identify the disclosure issue, the persons responsible for the statement and the remedy or liability framework applicable to that offer route.',
      hinglish: 'Offer document ek material pending dispute disclose nahi karta jo investor ka decision affect kar sakta hai. Disclosure gap, responsible persons aur relevant liability/remedy framework identify karo.',
      hindi: 'Offer document एक material pending dispute disclose नहीं करता जो investor का निर्णय प्रभावित कर सकता है। Disclosure gap, responsible persons और relevant liability/remedy framework पहचानें।',
    },
    quiz: {
      english: 'Explain why the same disclosure test cannot be applied mechanically to every public offer and private placement scenario.',
      hinglish: 'Same disclosure test ko har public offer aur private placement par mechanically apply kyun nahi kar sakte?',
      hindi: 'हर public offer और private placement पर एक ही disclosure test को बिना भेद के लागू क्यों नहीं किया जा सकता?',
    },
  },
  {
    key: 'law-share-capital', pack: 'corporate_law', chapterNumber: 4, title: 'Share Capital and Debentures',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['share capital and debentures', 'equity shares', 'preference shares', 'sweat equity', 'bonus shares', 'rights issue', 'buy back shares', 'debentures'],
    answer: {
      english: 'Share capital represents members’ ownership interests, while debentures are debt instruments issued by the company. Analyse the class and rights attached to the security, the authority for issue, offer and allotment process, payment terms, transfer or alteration and any applicable capital-maintenance restriction. Equity and preference shares carry different rights; a debenture holder is generally a creditor rather than a member. Transactions such as rights issues, bonus issues, reduction, buy-back and variation of class rights have distinct legal conditions. Do not infer a permitted issue merely because the company has sufficient authorised capital.',
      hinglish: 'Share capital members ka ownership interest hai, jabki debenture company ka debt instrument hai. Security ki class/rights, issue authority, offer-allotment process, payment terms, transfer/alteration aur capital-maintenance restrictions analyse karo. Equity aur preference shares ke rights alag hote hain; debenture holder normally creditor hota hai, member nahi. Rights, bonus, reduction, buy-back aur variation ke separate conditions hote hain.',
      hindi: 'Share capital members का ownership interest दर्शाता है, जबकि debenture company का debt instrument है। Security की class और rights, issue की authority, offer/allotment process, payment terms, transfer या alteration तथा capital-maintenance restrictions का analysis करें। Equity और preference shares के rights अलग होते हैं; debenture holder सामान्यतः creditor होता है, member नहीं। Rights issue, bonus issue, reduction, buy-back और class-right variation की शर्तें अलग-अलग होती हैं।',
    },
    example: {
      english: 'A company proposes to issue preference shares and later buy back equity shares. Treat the two transactions separately: identify the relevant authority, class rights, funding source, approvals and compliance conditions for each.',
      hinglish: 'Company preference shares issue karke baad mein equity buy-back karna chahti hai. Dono transactions ko separately analyse karo—authority, rights, funding, approvals aur compliance.',
      hindi: 'Company preference shares issue करने और बाद में equity buy-back करने का प्रस्ताव रखती है। दोनों transactions के लिए authority, rights, funding, approvals और compliance अलग-अलग जाँचें।',
    },
    quiz: {
      english: 'Why does an authorised-capital increase not by itself complete a valid issue of shares?',
      hinglish: 'Sirf authorised capital badha dene se valid share issue complete kyun nahi hota?',
      hindi: 'केवल authorised capital बढ़ाने से valid share issue अपने-आप complete क्यों नहीं होता?',
    },
  },
  {
    key: 'law-deposits', pack: 'corporate_law', chapterNumber: 5, title: 'Acceptance of Deposits by Companies',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['acceptance of deposits by companies', 'company deposits', 'deposits from members', 'deposit rules', 'repayment of deposits'],
    answer: {
      english: 'Deposit regulation protects persons who provide funds to a company and controls how those funds may be accepted, disclosed, secured, recorded and repaid. A receipt is not classified only by the label used in the agreement; examine the statutory definition, exclusions, source, purpose and terms. Different company categories may have different routes and safeguards. The compliance analysis may involve approvals, disclosures, records, repayment conditions and consequences of default. For a current numerical limit, eligibility condition or exemption, use the rule and statutory update applicable to the exact attempt rather than an evergreen note.',
      hinglish: 'Deposit rules un logon ko protect karte hain jo company ko funds dete hain. Receipt ko agreement ke label se classify mat karo; statutory definition, exclusions, source, purpose aur terms dekho. Company category ke hisaab se route/safeguards alag ho sakte hain. Approvals, disclosures, records, repayment aur default consequences analyse karo. Current limits/exemptions exact attempt ke rules se verify karo.',
      hindi: 'Deposit regulation उन व्यक्तियों की सुरक्षा करता है जो company को funds देते हैं। किसी receipt का classification केवल agreement के label से नहीं होता; statutory definition, exclusions, source, purpose और terms जाँचें। Company category के अनुसार route और safeguards अलग हो सकते हैं। Approvals, disclosures, records, repayment और default consequences का analysis करें। Current limits या exemptions exact attempt के rules से verify करें।',
    },
    example: {
      english: 'A company receives an advance from a customer and another amount from a director. Do not classify both automatically as deposits; test the statutory exclusions and documentary facts separately.',
      hinglish: 'Company customer se advance aur director se amount leti hai. Dono ko automatically deposit mat bolo; statutory exclusions aur documents separately test karo.',
      hindi: 'Company customer से advance और director से दूसरी राशि प्राप्त करती है। दोनों को स्वतः deposit न मानें; statutory exclusions और documents अलग-अलग जाँचें।',
    },
    quiz: {
      english: 'What facts would you need before classifying a receipt as a deposit or an excluded receipt?',
      hinglish: 'Receipt ko deposit ya excluded receipt classify karne ke liye kaunse facts chahiye?',
      hindi: 'किसी receipt को deposit या excluded receipt classify करने के लिए कौन-से facts आवश्यक हैं?',
    },
  },
  {
    key: 'law-charges', pack: 'corporate_law', chapterNumber: 6, title: 'Registration of Charges',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['registration of charges', 'company charge registration', 'charge on company assets', 'satisfaction of charge', 'modification of charge'],
    answer: {
      english: 'A charge is a security interest created over company property or assets in favour of a lender or other secured creditor. Analyse the instrument, asset, creation date, nature of security and filing responsibility. Registration gives public notice and supports the statutory priority and enforcement framework; modification and satisfaction also require attention. Distinguish a charge from a simple unsecured debt and from ownership transfer. The consequences of non-registration, delay, rectification or default depend on the governing provision and current procedural rules, so an answer should not invent a filing deadline or fee.',
      hinglish: 'Charge company ke asset/property par lender ke favour mein security interest hota hai. Instrument, asset, creation date, security ki nature aur filing responsibility identify karo. Registration public notice aur priority/enforcement framework ko support karta hai; modification aur satisfaction bhi record hone chahiye. Charge ko unsecured debt ya ownership transfer se distinguish karo. Deadline ya fee exact current rule se verify karo.',
      hindi: 'Charge company की property या assets पर lender के पक्ष में बनाया गया security interest है। Instrument, asset, creation date, security की nature और filing responsibility पहचानें। Registration public notice तथा priority/enforcement framework को support करता है; modification और satisfaction भी relevant हैं। Charge को unsecured debt और ownership transfer से अलग समझें। Filing deadline या fee current rule से verify करें।',
    },
    example: {
      english: 'A company mortgages machinery to secure a loan and later repays the lender. Analyse both the initial registration of the charge and the later recording of its satisfaction.',
      hinglish: 'Company loan secure karne ke liye machinery mortgage karti hai aur baad mein loan repay kar deti hai. Initial charge registration aur baad ki satisfaction filing dono analyse karo.',
      hindi: 'Company loan secure करने के लिए machinery mortgage करती है और बाद में loan repay कर देती है। Initial charge registration और बाद की satisfaction filing दोनों का analysis करें।',
    },
    quiz: {
      english: 'Explain why repayment of the secured loan and registration of satisfaction are separate compliance events.',
      hinglish: 'Secured loan repay hona aur charge satisfaction register hona separate compliance events kyun hain?',
      hindi: 'Secured loan का repayment और charge satisfaction का registration अलग compliance events क्यों हैं?',
    },
  },
  {
    key: 'law-management', pack: 'corporate_law', chapterNumber: 7, title: 'Management & Administration',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['management and administration', 'company meetings', 'annual general meeting', 'extraordinary general meeting', 'notice of meeting', 'quorum', 'proxy', 'minutes', 'register of members'],
    answer: {
      english: 'Company management and administration rules create a formal process for member participation, decision-making, records and accountability. For a meeting problem, identify who may call it, the purpose, notice, explanatory material, quorum, chair, voting method, proxy rights, minutes and filing obligations. Board meetings and general meetings serve different decision-making roles and must not be conflated. A resolution is valid only when the relevant authority and procedure are satisfied. Check the articles as well as the Act, but an article cannot override a mandatory statutory requirement.',
      hinglish: 'Management/admin rules members ki participation, decisions, records aur accountability ka process set karte hain. Meeting question mein calling authority, purpose, notice, explanatory statement, quorum, chair, voting, proxy, minutes aur filing check karo. Board meeting aur general meeting alag roles serve karte hain. Resolution tabhi valid hai jab authority aur procedure follow ho; Articles mandatory Act provision ko override nahi kar sakte.',
      hindi: 'Management और administration rules members की participation, decision-making, records तथा accountability की formal प्रक्रिया बनाते हैं। Meeting के प्रश्न में calling authority, purpose, notice, explanatory material, quorum, chair, voting method, proxy, minutes और filing obligations जाँचें। Board meeting और general meeting अलग हैं। Articles mandatory statutory requirement को override नहीं कर सकते।',
    },
    example: {
      english: 'Members challenge a resolution because the notice omitted material explanatory information. Review the meeting type, notice period, contents, voting and the statutory consequences before deciding validity.',
      hinglish: 'Members resolution challenge karte hain kyunki notice mein material explanatory information missing thi. Meeting type, notice timing/content, voting aur statutory consequence check karo.',
      hindi: 'Members resolution को challenge करते हैं क्योंकि notice में material explanatory information नहीं थी। Validity तय करने से पहले meeting type, notice timing/content, voting और statutory consequence जाँचें।',
    },
    quiz: {
      english: 'A meeting has sufficient attendance but the wrong person convened it. Why is attendance alone not enough to validate the decision?',
      hinglish: 'Meeting mein attendance sufficient hai par wrong person ne convene ki. Sirf attendance decision ko valid kyun nahi banati?',
      hindi: 'Meeting में attendance पर्याप्त है, लेकिन उसे गलत व्यक्ति ने convene किया। केवल attendance decision को valid क्यों नहीं बनाती?',
    },
  },
  {
    key: 'law-dividend', pack: 'corporate_law', chapterNumber: 8, title: 'Declaration and Payment of Dividend',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['declaration and payment of dividend', 'company dividend', 'interim dividend', 'final dividend', 'unpaid dividend account', 'dividend distribution'],
    answer: {
      english: 'Dividend is a distribution to members in their capacity as members and is subject to statutory sources, declaration authority and procedural safeguards. Distinguish final dividend recommended by directors and declared by members from interim dividend dealt with by the Board. A company cannot treat capital as freely distributable profit; distributability depends on the permitted source and applicable conditions. Once a dividend is declared, payment timelines, unpaid or unclaimed amounts and transfer to the relevant fund become important. Do not state a rate, time limit or permitted source without checking the exact attempt law.',
      hinglish: 'Dividend members ko unki membership capacity mein distribution hai, jo permitted source, declaration authority aur procedure par depend karta hai. Final dividend aur interim dividend ke decision-makers alag ho sakte hain. Capital ko freely distributable profit nahi maan sakte. Declaration ke baad payment timeline, unpaid/unclaimed amount aur relevant fund transfer important hain. Rate/time limit exact attempt law se verify karo.',
      hindi: 'Dividend members को उनकी membership capacity में distribution है और यह permitted source, declaration authority तथा procedural safeguards पर निर्भर करता है। Final dividend और interim dividend की declaration प्रक्रिया अलग हो सकती है। Capital को freely distributable profit नहीं माना जा सकता। Declaration के बाद payment timeline, unpaid/unclaimed amount और relevant fund transfer महत्वपूर्ण होते हैं।',
    },
    example: {
      english: 'A company has accumulated capital reserves but no distributable profits under the applicable framework. Do not assume that every reserve can fund a dividend; identify the permitted source and conditions.',
      hinglish: 'Company ke paas capital reserve hai par distributable profits nahi. Har reserve se dividend allowed maan lena galat hai; permitted source aur conditions verify karo.',
      hindi: 'Company के पास capital reserve है, लेकिन distributable profits नहीं हैं। हर reserve से dividend देना मान लेना गलत है; permitted source और conditions verify करें।',
    },
    quiz: {
      english: 'Explain the difference between recommending a final dividend and declaring an interim dividend, including why authority matters.',
      hinglish: 'Final dividend recommend karna aur interim dividend declare karna kaise differ karta hai? Authority kyun matter karti hai?',
      hindi: 'Final dividend recommend करने और interim dividend declare करने में क्या अंतर है? Authority क्यों महत्वपूर्ण है?',
    },
  },
  {
    key: 'law-accounts', pack: 'corporate_law', chapterNumber: 9, title: 'Accounts of Companies',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['accounts of companies', 'company financial statements', 'books of account', 'financial statements company law', 'board report', 'consolidated financial statements company act'],
    answer: {
      english: 'Company-account provisions govern maintenance of books, preparation and approval of financial statements, Board reporting, circulation, filing and preservation. The accounting framework and the Companies Act operate together: financial statements should comply with the applicable accounting standards and statutory presentation requirements. Identify the financial year, reporting entity, applicable consolidation requirement, approval authority and filing route. Books and supporting records must be sufficiently complete to explain transactions and financial position. If the question concerns a current format, due date, threshold or exemption, verify the relevant rule for the attempt.',
      hinglish: 'Company accounts provisions books maintain karne, financial statements prepare/approve karne, Board report, circulation, filing aur preservation ko govern karte hain. Accounting standards aur Companies Act dono saath apply hote hain. Financial year, reporting entity, consolidation requirement, approval authority aur filing route identify karo. Current format, due date, threshold ya exemption exact attempt ke rule se verify karo.',
      hindi: 'Company accounts provisions books की maintenance, financial statements की preparation/approval, Board reporting, circulation, filing और preservation नियंत्रित करते हैं। Applicable accounting standards तथा Companies Act दोनों का पालन आवश्यक है। Financial year, reporting entity, consolidation requirement, approval authority और filing route पहचानें। Current format, due date, threshold या exemption exact attempt के rule से verify करें।',
    },
    example: {
      english: 'A parent controls another entity and prepares only its own standalone statements. Before concluding compliance, assess whether the facts create a consolidation requirement and whether any exception applies.',
      hinglish: 'Parent company subsidiary control karti hai par sirf standalone statements banati hai. Compliance decide karne se pehle consolidation requirement aur possible exception check karo.',
      hindi: 'Parent company दूसरी entity को control करती है, लेकिन केवल standalone statements बनाती है। Compliance तय करने से पहले consolidation requirement और किसी exception की जाँच करें।',
    },
    quiz: {
      english: 'Why should a student distinguish books of account, financial statements, Board report and audit report in a company-law answer?',
      hinglish: 'Company-law answer mein books of account, financial statements, Board report aur audit report ko alag kyun rakhna chahiye?',
      hindi: 'Company-law answer में books of account, financial statements, Board report और audit report को अलग-अलग क्यों रखना चाहिए?',
    },
  },
  {
    key: 'law-audit', pack: 'corporate_law', chapterNumber: 10, title: 'Audit and Auditors',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['company audit and auditors', 'appointment of auditor', 'removal of auditor', 'auditor eligibility', 'auditor disqualification', 'auditor rights duties', 'statutory auditor company'],
    answer: {
      english: 'The company-audit framework protects auditor independence and defines appointment, eligibility, disqualification, tenure, removal, rights, duties, reporting and prohibited relationships or services. First identify whether the issue concerns appointment, continuation, resignation, removal, audit access or reporting. The auditor is responsible for forming and expressing an opinion on the financial statements under applicable auditing standards; management remains responsible for preparing them and maintaining relevant controls. A statutory auditor is not a substitute for management or an investigator of every fraud. Current appointment procedures, thresholds and disqualifications must be checked against the exact law and attempt.',
      hinglish: 'Company audit framework auditor independence aur appointment, eligibility, disqualification, tenure, removal, rights, duties, reporting aur prohibited relationships/services define karta hai. Pehle issue identify karo—appointment, resignation, removal, access ya reporting. Auditor financial statements par opinion deta hai; preparation aur controls management ki responsibility rehti hai. Auditor management ka substitute nahi. Current procedures/thresholds exact law se check karo.',
      hindi: 'Company-audit framework auditor independence तथा appointment, eligibility, disqualification, tenure, removal, rights, duties, reporting और prohibited relationships/services निर्धारित करता है। पहले issue पहचानें—appointment, resignation, removal, access या reporting। Auditor financial statements पर opinion देता है; preparation और controls की responsibility management की रहती है। Current procedures और thresholds exact law से verify करें।',
    },
    example: {
      english: 'A proposed auditor has a prohibited financial relationship with the company. Analyse eligibility and independence before discussing appointment or consent.',
      hinglish: 'Proposed auditor ka company se prohibited financial relationship hai. Appointment/consent se pehle eligibility aur independence analyse karo.',
      hindi: 'Proposed auditor का company से prohibited financial relationship है। Appointment या consent से पहले eligibility और independence का analysis करें।',
    },
    quiz: {
      english: 'Distinguish management responsibility for financial statements from the auditor’s responsibility for the audit opinion.',
      hinglish: 'Financial statements ke liye management ki responsibility aur audit opinion ke liye auditor ki responsibility mein difference batao.',
      hindi: 'Financial statements के लिए management की responsibility और audit opinion के लिए auditor की responsibility में अंतर बताइए।',
    },
  },
  {
    key: 'law-foreign-companies', pack: 'corporate_law', chapterNumber: 11, title: 'Companies Incorporated Outside India',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['companies incorporated outside india', 'foreign company india', 'foreign company registration', 'foreign company place of business', 'overseas company india'],
    answer: {
      english: 'A company incorporated outside India may fall within the Indian foreign-company framework when it establishes the prescribed place of business or carries on the relevant activity in India. Analyse incorporation jurisdiction, Indian presence, business activity, documents, authorised representatives, financial reporting and filing duties. Do not confuse a foreign company with an Indian subsidiary: a subsidiary incorporated in India is an Indian company even if its parent is foreign. Cross-border facts may also trigger FEMA, tax, sectoral and other regulatory requirements that sit alongside company law.',
      hinglish: 'Outside India incorporate hui company India mein prescribed place of business/activity establish kare toh foreign-company framework apply ho sakta hai. Incorporation country, India presence, business activity, documents, representatives, reporting aur filings analyse karo. Foreign parent ki India-incorporated subsidiary khud Indian company hoti hai. FEMA, tax aur sectoral rules bhi separately trigger ho sakte hain.',
      hindi: 'भारत के बाहर incorporated company यदि भारत में prescribed place of business या relevant activity स्थापित करती है तो foreign-company framework लागू हो सकता है। Incorporation jurisdiction, Indian presence, business activity, documents, representatives, reporting और filings जाँचें। Foreign parent की भारत में incorporated subsidiary स्वयं Indian company होती है। FEMA, tax और sectoral rules भी अलग से लागू हो सकते हैं।',
    },
    example: {
      english: 'A Singapore company opens an Indian branch, while another foreign group forms an Indian subsidiary. Compare the legal form and filing consequences rather than treating both as the same entity.',
      hinglish: 'Singapore company India mein branch kholti hai aur dusra group Indian subsidiary incorporate karta hai. Dono entities ko same mat mano; form aur filing consequences compare karo.',
      hindi: 'एक Singapore company भारत में branch खोलती है और दूसरा group Indian subsidiary incorporate करता है। दोनों entities को समान न मानें; legal form और filing consequences compare करें।',
    },
    quiz: {
      english: 'Why is a foreign branch not automatically equivalent to an Indian incorporated subsidiary?',
      hinglish: 'Foreign branch automatically Indian incorporated subsidiary ke equal kyun nahi hoti?',
      hindi: 'Foreign branch स्वतः Indian incorporated subsidiary के समान क्यों नहीं होती?',
    },
  },
  {
    key: 'law-llp', pack: 'corporate_law', chapterNumber: 12, title: 'The Limited Liability Partnership Act, 2008',
    section: 'Part I: Company Law and Limited Liability Partnership Law',
    aliases: ['limited liability partnership act', 'llp act 2008', 'limited liability partnership', 'llp incorporation', 'llp partner', 'designated partner', 'llp agreement'],
    answer: {
      english: 'An LLP is a separate body corporate with perpetual succession and a legal structure that combines entity-level personality with partner-based management. Its incorporation, partners, designated partners, LLP agreement, contribution, accounts, annual filings and winding-up are governed by a distinct framework. A partner is an agent of the LLP for its business but not automatically an agent of other partners. Limited liability is not a licence for fraud or a partner’s own wrongful conduct. Distinguish an LLP from a traditional partnership and a company; identify which statute and agreement term governs the issue.',
      hinglish: 'LLP separate body corporate hai jisme entity ki legal identity aur partner-based management combine hoti hai. Incorporation, partners/designated partners, LLP agreement, contribution, accounts, annual filings aur winding-up ke separate rules hain. Partner business ke liye LLP ka agent hota hai, automatically dusre partners ka nahi. Limited liability fraud ya apne wrongful act ko protect nahi karti.',
      hindi: 'LLP एक अलग body corporate है जिसमें entity की legal identity और partner-based management का संयोजन है। Incorporation, partners/designated partners, LLP agreement, contribution, accounts, annual filings तथा winding-up के अलग नियम हैं। Partner business के लिए LLP का agent होता है, अन्य partners का स्वतः नहीं। Limited liability fraud या अपने wrongful conduct से सुरक्षा नहीं देती।',
    },
    example: {
      english: 'One LLP partner enters a contract in the ordinary course of the LLP business. Analyse whether the LLP is bound and whether another partner is personally liable merely because of the relationship.',
      hinglish: 'Ek LLP partner ordinary business mein contract karta hai. Analyse karo LLP bound hai ya nahi aur doosra partner sirf partner hone se personally liable hoga kya.',
      hindi: 'एक LLP partner ordinary business में contract करता है। जाँचें कि LLP bound है या नहीं और क्या दूसरा partner केवल partner होने के कारण personally liable होगा।',
    },
    quiz: {
      english: 'Explain the separate legal personality of an LLP and the limit of a partner’s personal liability.',
      hinglish: 'LLP ki separate legal personality aur partner ki personal liability ki limit samjhao.',
      hindi: 'LLP की separate legal personality और partner की personal liability की सीमा समझाइए।',
    },
  },
  // Paper 2: Part II — Other Laws
  {
    key: 'law-general-clauses', pack: 'corporate_law', chapterNumber: 1, title: 'The General Clauses Act, 1897',
    section: 'Part II: Other Laws',
    aliases: ['general clauses act', 'general clauses act 1897', 'repeal and savings', 'commencement of act', 'statutory definitions general clauses'],
    answer: {
      english: 'The General Clauses Act supplies common interpretive rules for Central Acts and Regulations unless the context or a contrary intention indicates otherwise. It assists with recurring questions about definitions, powers, appointments, service, commencement, repeal, revival and the effect of references to repealed enactments. A repeal does not automatically erase every accrued right, obligation, liability or proceeding; savings principles must be examined. First check whether the relevant enactment applies the General Clauses Act and whether the special statute provides a different rule.',
      hinglish: 'General Clauses Act Central Acts/Regulations ke liye common interpretation rules deta hai, jab tak context ya contrary intention kuch aur na ho. Definitions, powers, appointment, service, commencement, repeal aur savings jaise issues mein help karta hai. Repeal se har accrued right, liability ya proceeding automatically erase nahi hoti; savings principles check karo aur special law ko bhi padho.',
      hindi: 'General Clauses Act Central Acts और Regulations के लिए सामान्य interpretive rules देता है, जब तक context या contrary intention कुछ और न बताए। यह definitions, powers, appointments, service, commencement, repeal और savings जैसे मुद्दों में सहायता करता है। Repeal से हर accrued right, liability या proceeding स्वतः समाप्त नहीं होती; special statute भी जाँचें।',
    },
    example: {
      english: 'A statute is repealed while a proceeding for an earlier contravention is pending. Analyse accrued liability and any savings clause before concluding that the proceeding ends.',
      hinglish: 'Purane contravention ki proceeding pending hai aur statute repeal ho gaya. Proceeding end maan-ne se pehle accrued liability aur savings clause analyse karo.',
      hindi: 'पुराने contravention की proceeding pending है और statute repeal हो गया। Proceeding समाप्त मानने से पहले accrued liability और savings clause का analysis करें।',
    },
    quiz: {
      english: 'Why does repeal of an enactment not always extinguish liabilities and proceedings that arose before repeal?',
      hinglish: 'Enactment repeal hone par pehle se arise liabilities aur proceedings hamesha extinguish kyun nahi hoti?',
      hindi: 'किसी enactment के repeal होने पर पहले उत्पन्न liabilities और proceedings हमेशा समाप्त क्यों नहीं होतीं?',
    },
  },
  {
    key: 'law-interpretation', pack: 'corporate_law', chapterNumber: 2, title: 'Interpretation of Statutes',
    section: 'Part II: Other Laws',
    aliases: ['interpretation of statutes', 'statutory interpretation', 'literal rule', 'golden rule', 'mischief rule', 'harmonious construction', 'internal aids', 'external aids'],
    answer: {
      english: 'Statutory interpretation seeks the meaning Parliament intended the provision to carry, read in its text, context and purpose. Begin with the ordinary grammatical meaning; where ambiguity, absurdity or conflict arises, consider accepted interpretive principles and aids. Internal aids include the title, preamble, headings, provisos, explanations, illustrations and schedules; external aids may include legislative history and recognised contextual material where permitted. A proviso, explanation or non-obstante clause has a specific function and must not be read mechanically. Choose the interpretation that fits the whole enactment and does not make words redundant without justification.',
      hinglish: 'Statutory interpretation ka aim provision ka meaning text, context aur purpose ke saath samajhna hai. Pehle ordinary grammatical meaning dekho; ambiguity ya conflict ho toh accepted rules aur aids apply karo. Internal aids mein title, preamble, headings, proviso, explanation, illustration aur schedules; external aids mein permitted legislative history/context ho sakte hain. Proviso ya non-obstante clause ko mechanically nahi padhna. Puri Act ke saath harmonious meaning choose karo.',
      hindi: 'Statutory interpretation का उद्देश्य provision का अर्थ उसके text, context और purpose के साथ समझना है। पहले सामान्य grammatical meaning देखें; ambiguity या conflict पर accepted interpretive principles और aids का उपयोग करें। Internal aids में title, preamble, headings, proviso, explanation, illustration और schedules शामिल हैं। Proviso तथा non-obstante clause को mechanically न पढ़ें; पूरे enactment के साथ harmonious meaning चुनें।',
    },
    example: {
      english: 'A broad definition appears to conflict with a specific proviso. Read both together and determine whether the proviso creates a limited exception rather than deleting the definition.',
      hinglish: 'Broad definition aur specific proviso conflict jaise lagte hain. Dono ko saath padho; check karo proviso limited exception create karta hai ya definition ko alter karta hai.',
      hindi: 'Broad definition और specific proviso में conflict दिखता है। दोनों को साथ पढ़कर जाँचें कि proviso limited exception बनाता है या definition को बदलता है।',
    },
    quiz: {
      english: 'When can a literal reading be rejected in favour of another recognised interpretive approach?',
      hinglish: 'Literal reading ko chhodkar doosra recognised interpretation kab adopt kiya ja sakta hai?',
      hindi: 'किस परिस्थिति में literal reading के स्थान पर दूसरा recognised interpretive approach अपनाया जा सकता है?',
    },
  },
  {
    key: 'law-fema', pack: 'corporate_law', chapterNumber: 3, title: 'The Foreign Exchange Management Act, 1999',
    section: 'Part II: Other Laws',
    aliases: ['foreign exchange management act', 'fema', 'capital account transaction', 'current account transaction', 'authorised dealer', 'foreign exchange india'],
    answer: {
      english: 'FEMA regulates specified foreign-exchange transactions and cross-border flows through a permission, restriction, reporting and authorised-dealer framework. Distinguish current-account transactions from capital-account transactions because their treatment and permitted routes differ. Identify the resident status of the person, nature of the transaction, counterparty, currency flow, applicable RBI direction or Central Government rule and reporting requirement. FEMA analysis is not complete by naming the Act alone; regulations and directions issued under it may determine the practical answer. Current limits, routes and reporting timelines must be verified from RBI and the applicable statutory update.',
      hinglish: 'FEMA foreign-exchange aur cross-border transactions ko permission, restriction, reporting aur authorised-dealer framework se regulate karta hai. Current-account aur capital-account transaction ko distinguish karo; treatment alag ho sakta hai. Person ka residential status, transaction nature, counterparty, currency flow, RBI direction/Rules aur reporting identify karo. Current limits/routes/timelines RBI ke updated source se verify karo.',
      hindi: 'FEMA foreign-exchange तथा cross-border transactions को permission, restriction, reporting और authorised-dealer framework से regulate करता है। Current-account और capital-account transactions में अंतर करें क्योंकि उनका treatment अलग हो सकता है। Person का residential status, transaction की nature, counterparty, currency flow, RBI directions तथा reporting requirement पहचानें। Current limits और timelines RBI के updated source से verify करें।',
    },
    example: {
      english: 'An Indian resident proposes to remit money abroad for a permitted personal purpose and separately proposes to acquire a foreign asset. Classify each transaction before checking the applicable route and limit.',
      hinglish: 'Indian resident personal purpose ke liye remittance aur alag se foreign asset acquire karna chahta hai. Applicable route/limit check karne se pehle dono transactions classify karo.',
      hindi: 'एक Indian resident personal purpose के लिए remittance और अलग से foreign asset acquire करना चाहता है। Applicable route या limit जाँचने से पहले दोनों transactions classify करें।',
    },
    quiz: {
      english: 'Why must a FEMA answer identify both the person’s residential status and the type of transaction?',
      hinglish: 'FEMA answer mein person ka residential status aur transaction type dono identify karna kyun zaroori hai?',
      hindi: 'FEMA के उत्तर में person का residential status और transaction type दोनों पहचानना क्यों आवश्यक है?',
    },
  },
  // Paper 3: Section A — Income-tax Law
  {
    key: 'tax-basic-concepts', pack: 'income_tax', chapterNumber: 1, title: 'Basic Concepts',
    section: 'Section A: Income-tax Law',
    aliases: ['income tax basic concepts', 'basic concepts income tax', 'assessee person previous year assessment year', 'gross total income total income', 'agricultural income concept'],
    answer: {
      english: 'Start a tax computation by identifying the person, previous year, assessment year, residential status and the charging framework applicable to that period. Distinguish income, gross total income, total income, tax liability and tax payable after credits. A receipt is not automatically taxable merely because money is received; its character, timing, source and statutory treatment matter. Likewise, an accounting profit is not automatically taxable income. Build the computation from the relevant heads and statutory adjustments, and use the Finance Act and rules that apply to the examination attempt.',
      hinglish: 'Tax computation se pehle person, previous year, assessment year, residential status aur us period ka charging framework identify karo. Income, gross total income, total income, tax liability aur credits ke baad tax payable alag concepts hain. Har receipt automatically taxable nahi hoti; character, timing, source aur statutory treatment dekho. Accounting profit bhi automatically taxable income nahi. Exact attempt ka Finance Act/Rules use karo.',
      hindi: 'Tax computation से पहले person, previous year, assessment year, residential status और उस period का charging framework पहचानें। Income, gross total income, total income, tax liability तथा credits के बाद tax payable अलग concepts हैं। हर receipt स्वतः taxable नहीं होती; उसका character, timing, source और statutory treatment देखें। Accounting profit भी स्वतः taxable income नहीं है।',
    },
    example: {
      english: 'A taxpayer receives a loan, a gift and business consideration in the same year. Classify each receipt by nature and applicable provision instead of adding every bank credit as taxable income.',
      hinglish: 'Taxpayer ko same year loan, gift aur business consideration milta hai. Har bank credit ko taxable add mat karo; nature aur applicable provision ke hisaab se classify karo.',
      hindi: 'Taxpayer को एक ही year में loan, gift और business consideration मिलता है। हर bank credit को taxable न जोड़ें; nature और applicable provision के अनुसार classify करें।',
    },
    quiz: {
      english: 'Explain why cash received, accounting income and taxable total income are not necessarily the same amount.',
      hinglish: 'Cash received, accounting income aur taxable total income same amount kyun zaroori nahi hain?',
      hindi: 'Cash received, accounting income और taxable total income का amount समान होना आवश्यक क्यों नहीं है?',
    },
  },
  {
    key: 'tax-residential-status', pack: 'income_tax', chapterNumber: 2, title: 'Residential Status and Scope of Total Income',
    section: 'Section A: Income-tax Law',
    aliases: ['residential status and scope of total income', 'residential status income tax', 'resident and ordinarily resident', 'non resident', 'scope of total income', 'tax residency'],
    answer: {
      english: 'Residential status is determined for each previous year using the statutory tests and relevant facts; it is not chosen by the taxpayer or fixed permanently by citizenship. Apply the basic stay tests and any special rules relevant to the individual’s category, then determine the applicable resident classification. The scope of taxable income can differ according to residential status and the source, receipt and accrual of income. Do not use a single day-count shortcut without testing all statutory conditions, exceptions and the attempt-specific amendments.',
      hinglish: 'Residential status har previous year ke liye statutory tests aur facts se decide hota hai; citizenship ya taxpayer ki choice se fixed nahi hota. Basic stay tests aur individual category ke special rules apply karke classification nikalo. Taxable income ka scope status, source, receipt aur accrual par depend karta hai. Sirf day-count shortcut mat lagao; exceptions aur exact attempt amendments check karo.',
      hindi: 'Residential status प्रत्येक previous year के लिए statutory tests और facts से तय होता है; यह citizenship या taxpayer की choice से स्थायी रूप से तय नहीं होता। Basic stay tests तथा individual category के special rules लागू करके classification करें। Taxable income का scope status, source, receipt और accrual पर निर्भर करता है। केवल day-count shortcut न अपनाएँ; exceptions और exact attempt amendments जाँचें।',
    },
    example: {
      english: 'An individual spends part of the year in India and receives salary abroad for services performed in different locations. Determine residential status first, then analyse where the services were rendered and how the income is received or accrued.',
      hinglish: 'Individual saal ka kuch hissa India mein rehta hai aur salary abroad receive karta hai. Pehle residential status decide karo, phir services kahan perform hui aur income kahan accrue/receive hui analyse karo.',
      hindi: 'एक individual year का कुछ हिस्सा भारत में रहता है और abroad salary प्राप्त करता है। पहले residential status तय करें, फिर services कहाँ perform हुईं और income कहाँ accrue/receive हुई, इसका analysis करें।',
    },
    quiz: {
      english: 'Why must residential status be redetermined for each previous year, and how does it affect the scope of income?',
      hinglish: 'Residential status har previous year dobara kyun determine hota hai aur income scope par kya effect hota hai?',
      hindi: 'Residential status प्रत्येक previous year में दोबारा क्यों निर्धारित होता है और income के scope पर इसका क्या प्रभाव पड़ता है?',
    },
  },
  {
    key: 'tax-heads-income', pack: 'income_tax', chapterNumber: 3, title: 'Heads of Income',
    section: 'Section A: Income-tax Law',
    aliases: ['heads of income', 'income from salaries', 'salary income', 'income from house property', 'profits and gains of business or profession', 'capital gains', 'income from other sources', 'five heads of income'],
    answer: {
      english: 'The Act classifies taxable income under five heads: Salaries, Income from House Property, Profits and Gains of Business or Profession, Capital Gains and Income from Other Sources. Classification depends on the legal character and source of the receipt, not merely the taxpayer’s accounting label. Each head has its own computation rules, permitted deductions, timing and special treatment. Apply the relevant head first, compute its income separately, then aggregate the results and consider set-off, deductions and other statutory steps. The detailed provisions, tax rates and monetary thresholds must be taken from the attempt-specific material.',
      hinglish: 'Act taxable income ko five heads mein classify karta hai: Salaries, House Property, PGBP, Capital Gains aur Other Sources. Classification receipt ke legal character/source se hota hai, accounting label se nahi. Har head ke computation rules, deductions aur timing alag hain. Pehle relevant head identify karo, income separately compute karo, phir aggregate karke set-off/deductions apply karo. Rates aur limits exact attempt material se lo.',
      hindi: 'Act taxable income को पाँच heads में classify करता है: Salaries, Income from House Property, Profits and Gains of Business or Profession, Capital Gains और Income from Other Sources। Classification receipt के legal character और source पर निर्भर करता है, केवल accounting label पर नहीं। प्रत्येक head के computation rules, deductions और timing अलग हैं। पहले head पहचानें, income अलग compute करें और फिर aggregation तथा statutory adjustments करें।',
    },
    example: {
      english: 'A person receives employment salary, rent from a let-out property, business receipts and interest. Do not combine them immediately; classify each receipt under the correct head and apply that head’s computation mechanism.',
      hinglish: 'Person ko salary, rent, business receipts aur interest milta hai. Sabko immediately combine mat karo; correct head identify karke uska computation method apply karo.',
      hindi: 'एक व्यक्ति को salary, rent, business receipts और interest मिलता है। सभी को तुरंत combine न करें; सही head पहचानकर उसका computation method लागू करें।',
    },
    quiz: {
      english: 'A receipt is shown as “other income” in the books. Why is that accounting description insufficient to decide its income-tax head?',
      hinglish: 'Books mein receipt “other income” hai. Ye accounting label income-tax head decide karne ke liye insufficient kyun hai?',
      hindi: 'Books में receipt को “other income” दिखाया गया है। यह accounting label income-tax head तय करने के लिए पर्याप्त क्यों नहीं है?',
    },
  },
  {
    key: 'tax-clubbing', pack: 'income_tax', chapterNumber: 4, title: 'Income of Other Persons Included in Total Income of Assessee',
    section: 'Section A: Income-tax Law',
    aliases: ['income of other persons included in total income', 'clubbing of income', 'income of spouse', 'minor child income clubbing', 'transfer of income without transfer of asset'],
    answer: {
      english: 'Clubbing provisions are targeted statutory exceptions to the general principle that income is taxed in the hands of the person who earns or receives it. They may attribute specified income to another assessee because of a relationship, transfer of assets, revocable arrangement or other defined condition. Do not assume that every family transfer causes clubbing; identify the precise trigger, exception, income type and person in whose total income it is included. Separate ownership of the asset from the person assessed on its income, and verify the applicable exceptions and computation rules for the attempt.',
      hinglish: 'Clubbing provisions general rule ka targeted exception hain: specified situations mein income kisi aur assessee ki total income mein include hoti hai. Relationship, asset transfer, revocable arrangement ya statutory condition trigger ho sakti hai. Har family transfer par clubbing assume mat karo; exact trigger, exception, income type aur assessee identify karo.',
      hindi: 'Clubbing provisions सामान्य सिद्धांत का targeted exception हैं; कुछ निर्धारित स्थितियों में income किसी अन्य assessee की total income में शामिल होती है। Relationship, asset transfer, revocable arrangement या statutory condition trigger हो सकती है। हर family transfer में clubbing मानकर न चलें; exact trigger, exception, income type और assessee पहचानें।',
    },
    example: {
      english: 'A person transfers an asset to a spouse without adequate consideration and the asset produces income. Identify the statutory clubbing trigger and then test any exception before attributing the income.',
      hinglish: 'Person spouse ko inadequate consideration par asset transfer karta hai aur asset income generate karta hai. Clubbing trigger identify karo, phir exception check karke income attribution decide karo.',
      hindi: 'एक व्यक्ति spouse को inadequate consideration पर asset transfer करता है और asset income देता है। Clubbing trigger पहचानें और income attribute करने से पहले exception जाँचें।',
    },
    quiz: {
      english: 'How would you distinguish transfer of an asset from transfer of income without transfer of the asset?',
      hinglish: 'Asset transfer aur asset transfer kiye bina sirf income transfer karne mein kya difference hai?',
      hindi: 'Asset के transfer और asset transfer किए बिना केवल income transfer करने में क्या अंतर है?',
    },
  },
  {
    key: 'tax-setoff', pack: 'income_tax', chapterNumber: 5, title: 'Set-Off or Carry Forward and Set-off of Losses',
    section: 'Section A: Income-tax Law',
    aliases: ['set off and carry forward of losses', 'set off losses', 'carry forward losses', 'inter source set off', 'inter head set off', 'business loss carry forward', 'capital loss set off'],
    answer: {
      english: 'Loss relief follows a prescribed sequence and is subject to restrictions based on the source, head, nature of loss, year and compliance conditions. First test intra-head set-off, then inter-head set-off where permitted, and finally carry forward subject to the applicable return-filing and time conditions. Certain losses can be set off only against specified income and may have separate carry-forward periods. Keep current-year loss, brought-forward loss and unabsorbed allowances conceptually separate. Never apply a generic “all losses offset all income” rule; use the exact statutory matrix for the attempt.',
      hinglish: 'Loss relief prescribed sequence aur restrictions ke according hota hai—source, head, loss type, year aur compliance matter karte hain. Pehle intra-head, phir allowed inter-head set-off, phir conditions ke saath carry forward test karo. Kuch losses sirf specified income ke against set off hote hain. Current-year loss, brought-forward loss aur unabsorbed allowance alag rakho.',
      hindi: 'Loss relief निर्धारित sequence और restrictions के अनुसार मिलता है; source, head, loss type, year और compliance महत्वपूर्ण हैं। पहले intra-head, फिर permitted inter-head set-off और उसके बाद conditions के साथ carry forward जाँचें। कुछ losses केवल specified income के against set off होते हैं। Current-year loss, brought-forward loss और unabsorbed allowance को अलग रखें।',
    },
    example: {
      english: 'An assessee has a current business loss, brought-forward capital loss and salary income. Prepare a loss-wise matrix and test each proposed set-off separately rather than netting all figures together.',
      hinglish: 'Assessee ke paas current business loss, brought-forward capital loss aur salary income hai. Har loss ka set-off separately test karo; sab figures ko ek saath net mat karo.',
      hindi: 'Assessee के पास current business loss, brought-forward capital loss और salary income है। सभी amounts को net करने के बजाय प्रत्येक loss का set-off अलग जाँचें।',
    },
    quiz: {
      english: 'Why must the head and nature of a loss be identified before deciding whether it can be set off against another income?',
      hinglish: 'Loss ko kisi aur income se set off karne se pehle head aur nature identify karna kyun zaroori hai?',
      hindi: 'किसी loss को दूसरी income से set off करने से पहले उसका head और nature पहचानना क्यों आवश्यक है?',
    },
  },
  {
    key: 'tax-deductions', pack: 'income_tax', chapterNumber: 6, title: 'Deductions from Gross Total Income',
    section: 'Section A: Income-tax Law',
    aliases: ['deductions from gross total income', 'deductions from gti', 'chapter vi a deductions', 'tax deductions', 'eligible deductions income tax'],
    answer: {
      english: 'Deductions from Gross Total Income are applied only after computing income under the heads and making the relevant aggregation and set-off. Each deduction has its own eligibility, qualifying payment or activity, documentation, cap, timing and interaction with the selected tax regime. A payment does not automatically qualify merely because it is a personal expense or investment. Check whether the deduction is available to the person, whether the particular regime permits it and whether any condition or limit is met. Use the Finance Act and assessment-year material applicable to the student’s attempt; do not rely on a remembered limit.',
      hinglish: 'GTI deductions heads ki income compute, aggregate aur set-off ke baad apply hoti hain. Har deduction ki eligibility, qualifying payment/activity, documents, cap, timing aur tax regime ke saath interaction alag hai. Personal expense ya investment automatically eligible nahi. Person, chosen regime aur conditions verify karo; exact attempt ka Finance Act use karo.',
      hindi: 'Gross Total Income से deductions heads की income compute, aggregation और set-off के बाद लागू होती हैं। प्रत्येक deduction की eligibility, qualifying payment/activity, documents, cap, timing और selected tax regime के साथ interaction अलग है। हर personal expense या investment स्वतः eligible नहीं होती। Exact attempt के Finance Act और assessment-year material से limits verify करें।',
    },
    example: {
      english: 'An individual makes several investments and donations. Create a deduction checklist: eligible person, permitted regime, qualifying category, evidence, applicable cap and whether the payment falls in the relevant year.',
      hinglish: 'Individual multiple investments aur donations karta hai. Checklist banao: eligible person, allowed regime, qualifying category, proof, cap aur relevant year.',
      hindi: 'एक individual कई investments और donations करता है। Checklist बनाएं: eligible person, permitted regime, qualifying category, proof, cap और relevant year।',
    },
    quiz: {
      english: 'Why can two taxpayers with identical payments claim different deductions under different tax regimes or facts?',
      hinglish: 'Same payments hone par bhi different regime/facts mein taxpayers ki deduction alag kyun ho sakti hai?',
      hindi: 'समान payments होने पर भी अलग tax regime या facts के कारण taxpayers की deduction अलग क्यों हो सकती है?',
    },
  },
  {
    key: 'tax-tds-advance', pack: 'income_tax', chapterNumber: 7, title: 'Tax Deduction or Collection at Source and Advance Tax',
    section: 'Section A: Income-tax Law',
    aliases: ['tds tcs and advance tax', 'tax deduction at source', 'tax collection at source', 'advance tax', 'tds return', 'tax deducted at source'],
    answer: {
      english: 'TDS and TCS are collection mechanisms that shift part of tax collection to specified transactions or persons; advance tax requires the taxpayer to pay tax during the year when the statutory conditions apply. Identify the payer/collector, payee/collectee, nature of payment, timing, applicable threshold, rate, certificate or statement and credit-matching process. A deduction or collection is generally a tax credit mechanism, not a separate final tax on the underlying income. Late deduction, deposit, reporting or payment can create distinct interest, fee or other consequences. All rates, thresholds and dates are attempt-sensitive and must be verified.',
      hinglish: 'TDS/TCS collection mechanisms hain; specified payment par payer/collector tax deduct ya collect karta hai. Advance tax mein taxpayer year ke during tax pay karta hai jab conditions apply hoti hain. Payer, payee, payment nature, timing, threshold, rate, certificate/statement aur credit matching identify karo. TDS/TCS generally tax credit hai, final separate tax nahi. Rates/dates current attempt se verify karo.',
      hindi: 'TDS और TCS collection mechanisms हैं जिनमें specified transactions पर tax deduct या collect किया जाता है। Advance tax में लागू conditions के अनुसार taxpayer year के दौरान tax pay करता है। Payer, payee, payment nature, timing, threshold, rate, certificate/statement और credit matching पहचानें। TDS/TCS सामान्यतः tax credit mechanism है, underlying income पर अलग final tax नहीं। Rates और dates attempt-specific हैं।',
    },
    example: {
      english: 'A business makes payments to employees and contractors and also receives amounts on which tax may be collected. Classify each transaction before deciding the responsible person, timing and credit available to the recipient.',
      hinglish: 'Business employees/contractors ko payments karta hai aur kuch receipts par TCS ho sakta hai. Responsible person, timing aur recipient credit decide karne se pehle har transaction classify karo.',
      hindi: 'Business employees/contractors को payments करता है और कुछ receipts पर TCS लागू हो सकता है। Responsible person, timing और recipient credit तय करने से पहले प्रत्येक transaction classify करें।',
    },
    quiz: {
      english: 'Distinguish TDS, TCS and advance tax by identifying who pays, who collects and when the amount is remitted.',
      hinglish: 'TDS, TCS aur advance tax ko payer, collector aur remittance timing se distinguish karo.',
      hindi: 'TDS, TCS और advance tax में payer, collector तथा remittance timing के आधार पर अंतर बताइए।',
    },
  },
  {
    key: 'tax-return-self-assessment', pack: 'income_tax', chapterNumber: 8, title: 'Provisions for Filing Return of Income and Self Assessment',
    section: 'Section A: Income-tax Law',
    aliases: ['filing return of income', 'return of income', 'self assessment tax', 'income tax return filing', 'belated return', 'revised return', 'defective return'],
    answer: {
      english: 'Return-filing provisions determine who must file, the form and method, due date, verification, processing and consequences of omission or error. Distinguish a compulsory filing obligation from a return filed to claim a refund, carry forward a loss or complete another statutory requirement. A return may be original, belated, revised or otherwise treated under the applicable process; each has conditions and time limits. Self-assessment reconciles tax on the returned income with advance tax, TDS/TCS and other credits. Verify the current form, deadline, late fee, interest and revision window for the correct assessment year.',
      hinglish: 'Return filing provisions batate hain kisko file karna hai, form/method, due date, verification, processing aur error/omission ke consequences. Compulsory filing aur refund/loss carry forward ke liye filing ko distinguish karo. Original, belated, revised returns ki conditions/time limits alag hoti hain. Self-assessment mein returned income ka tax, advance tax aur TDS/TCS credits reconcile karo. Current deadlines exact AY se verify karo.',
      hindi: 'Return filing provisions तय करते हैं कि किसे file करना है, form/method, due date, verification, processing तथा omission/error के consequences क्या होंगे। Compulsory filing और refund या loss carry forward के लिए filing में अंतर करें। Original, belated और revised returns की conditions अलग हैं। Self-assessment में returned income का tax advance tax और TDS/TCS credits से reconcile होता है।',
    },
    example: {
      english: 'A taxpayer discovers an omitted income item after filing a return. Identify whether the facts permit a correction route and verify the applicable deadline, interest and tax consequences.',
      hinglish: 'Taxpayer return file karne ke baad omitted income discover karta hai. Correction route available hai ya nahi aur deadline/interest/tax consequences verify karo.',
      hindi: 'Taxpayer return file करने के बाद omitted income discover करता है। जाँचें कि correction route उपलब्ध है या नहीं और deadline, interest तथा tax consequences verify करें।',
    },
    quiz: {
      english: 'Why should a return-filing answer distinguish the obligation to file, the type of return and the self-assessment payment?',
      hinglish: 'Return filing answer mein filing obligation, return type aur self-assessment payment alag kyun rakhna chahiye?',
      hindi: 'Return filing के उत्तर में filing obligation, return type और self-assessment payment को अलग-अलग क्यों रखना चाहिए?',
    },
  },
  {
    key: 'tax-computation', pack: 'income_tax', chapterNumber: 9, title: 'Income Tax Liability - Computation and Optimisation',
    section: 'Section A: Income-tax Law',
    aliases: ['income tax liability computation and optimisation', 'computation of tax liability', 'tax liability computation', 'tax optimisation', 'compare tax regimes', 'tax payable computation'],
    answer: {
      english: 'A reliable computation follows a fixed sequence: classify income under the heads, compute each head, aggregate, apply permitted set-off, arrive at Gross Total Income, apply eligible deductions, determine Total Income, compute tax under the applicable regime and assessment-year provisions, then add or adjust surcharge, cess, interest, fees and credits as relevant. Optimisation must compare legally available alternatives on the same facts and include compliance and timing effects. Do not compare only headline rates or assume a deduction is available in every regime. Show workings and disclose every missing fact that can change the result.',
      hinglish: 'Reliable computation ka sequence: heads classify karo, har head compute karo, aggregate, allowed set-off, GTI, eligible deductions, Total Income, applicable regime/AY ke according tax, phir relevant surcharge, cess, interest, fee aur credits adjust karo. Optimisation mein same facts par legal options compare karo. Sirf headline rate mat compare karo; workings aur missing assumptions show karo.',
      hindi: 'Reliable computation का sequence है: income को heads में classify करें, प्रत्येक head compute करें, aggregate और permitted set-off लागू करें, GTI निकालें, eligible deductions घटाएँ, Total Income निर्धारित करें और applicable regime/AY के अनुसार tax compute करें। फिर relevant surcharge, cess, interest, fees तथा credits adjust करें। Optimisation में समान facts पर legally available options compare करें।',
    },
    example: {
      english: 'Two regimes produce different deductions and tax outcomes for the same taxpayer. Prepare both computations from the same income facts, apply only permitted deductions and compare final liability after applicable additions and credits.',
      hinglish: 'Same taxpayer ke liye do regimes mein deductions/tax outcome alag hain. Same income facts se dono computations banao, sirf allowed deductions lo aur final liability compare karo.',
      hindi: 'एक taxpayer के लिए दो regimes में deductions और tax outcome अलग हैं। समान income facts से दोनों computations बनाएं, केवल permitted deductions लें और final liability compare करें।',
    },
    quiz: {
      english: 'Why is a comparison of tax regimes incomplete unless the same income facts, deductions, credits and compliance effects are considered?',
      hinglish: 'Same income facts, deductions, credits aur compliance effects ke bina regime comparison incomplete kyun hai?',
      hindi: 'समान income facts, deductions, credits और compliance effects के बिना tax-regime comparison incomplete क्यों है?',
    },
  },
  // Paper 3: Section B — Goods and Services Tax
  {
    key: 'gst-introduction', pack: 'gst', chapterNumber: 1, title: 'GST in India - An Introduction',
    section: 'Section B: Goods and Services Tax',
    aliases: ['gst in india introduction', 'introduction to gst', 'gst framework', 'dual gst model', 'cgst sgst igst', 'gst destination based tax'],
    answer: {
      english: 'GST is a destination-based indirect tax on supplies of goods or services, administered through a dual structure in India. The transaction’s nature and location determine whether Central and State components or an inter-State component apply. GST replaced multiple earlier indirect-tax levies but retains specific exclusions and special treatment under the Constitution and statutes. A sound answer distinguishes taxable supply, person liable, place of supply, time, value, credit and payment. Do not assume every transaction is taxable or that one GST component applies to every movement.',
      hinglish: 'GST goods/services ki supply par destination-based indirect tax hai aur India mein dual structure follow karta hai. Transaction ki nature aur location se CGST/SGST ya IGST treatment decide hota hai. Kuch exclusions aur special treatments bhi hain. Har case mein taxable supply, liable person, place, time, value, credit aur payment separately identify karo. Har transaction taxable ya same GST component wala nahi hota.',
      hindi: 'GST goods या services की supply पर destination-based indirect tax है और भारत में dual structure follow करता है। Transaction की nature और location से CGST/SGST या IGST treatment तय होता है। कुछ exclusions तथा special treatments भी हैं। प्रत्येक case में taxable supply, liable person, place, time, value, credit और payment अलग-अलग पहचानें।',
    },
    example: {
      english: 'A supplier in one State sells goods to a registered buyer in another State. Classify the supply as intra-State or inter-State using the legally relevant supplier and place-of-supply facts.',
      hinglish: 'Ek State ka supplier doosri State ke registered buyer ko goods bechta hai. Supplier location aur place-of-supply facts se intra/inter-State classify karo.',
      hindi: 'एक State का supplier दूसरी State के registered buyer को goods बेचता है। Supplier location और place-of-supply facts के आधार पर intra/inter-State classification करें।',
    },
    quiz: {
      english: 'Why must the place of supply be determined before choosing the applicable GST component?',
      hinglish: 'Applicable GST component choose karne se pehle place of supply decide karna kyun zaroori hai?',
      hindi: 'Applicable GST component चुनने से पहले place of supply तय करना क्यों आवश्यक है?',
    },
  },
  {
    key: 'gst-supply', pack: 'gst', chapterNumber: 2, title: 'Supply under GST',
    section: 'Section B: Goods and Services Tax',
    aliases: ['supply under gst', 'taxable supply gst', 'composite supply', 'mixed supply', 'deemed supply', 'consideration in gst', 'business test gst'],
    answer: {
      english: 'Supply is the central taxable event under GST, but its scope depends on the statutory definition, business connection, consideration rules, schedules and exclusions. Identify whether the transaction involves goods, services or both; whether it is made in the course or furtherance of business; and whether a specific deemed-supply rule applies even without ordinary consideration. Composite and mixed supplies have different classification consequences. A mere movement, reimbursement, gift or transfer should not be classified without testing the relevant statutory entry and facts.',
      hinglish: 'GST mein supply central taxable event hai, lekin scope statutory definition, business connection, consideration rules, schedules aur exclusions par depend karta hai. Goods/services, business purpose aur deemed-supply provisions check karo. Composite aur mixed supply ka treatment alag hota hai. Mere movement, reimbursement, gift ya transfer ko facts/statutory entry check kiye bina supply mat bolo.',
      hindi: 'GST में supply मुख्य taxable event है, लेकिन इसका scope statutory definition, business connection, consideration rules, schedules और exclusions पर निर्भर करता है। Goods/services, business purpose तथा deemed-supply provisions जाँचें। Composite और mixed supply के consequences अलग हैं। Mere movement, reimbursement, gift या transfer को facts तथा statutory entry जाँचे बिना supply न मानें।',
    },
    example: {
      english: 'A business transfers stock between two separately registered locations under the same legal entity. Determine whether the law treats the locations as distinct persons and whether the transfer falls within a supply entry.',
      hinglish: 'Ek business same legal entity ke do separately registered locations ke beech stock transfer karta hai. Distinct-person treatment aur supply entry test karo.',
      hindi: 'एक business same legal entity के दो separately registered locations के बीच stock transfer करता है। Distinct-person treatment और supply entry जाँचें।',
    },
    quiz: {
      english: 'How do you distinguish a composite supply from a mixed supply, and why does the distinction matter?',
      hinglish: 'Composite aur mixed supply mein difference kaise identify karoge aur ye kyun matter karta hai?',
      hindi: 'Composite supply और mixed supply में अंतर कैसे पहचानेंगे और यह क्यों महत्वपूर्ण है?',
    },
  },
  {
    key: 'gst-charge', pack: 'gst', chapterNumber: 3, title: 'Charge of GST',
    section: 'Section B: Goods and Services Tax',
    aliases: ['charge of gst', 'levy of gst', 'reverse charge mechanism', 'forward charge', 'taxable person gst liability', 'composition levy'],
    answer: {
      english: 'The charge provisions identify the taxable event, the person liable, the applicable levy and any special mechanism such as reverse charge or composition treatment. First establish that a supply exists and is taxable; then determine whether the supplier or recipient is responsible and whether a notified category or exception applies. Registration status alone does not answer every liability question. Separate the charge of tax from collection, invoice, payment and input-credit steps. Rates, notified categories and composition eligibility are current-law questions and must be sourced for the attempt.',
      hinglish: 'Charge provisions taxable event, liable person, levy aur reverse charge/composition jaise special mechanisms decide karte hain. Pehle taxable supply establish karo; phir supplier ya recipient liability aur notified category/exception check karo. Registration alone har liability answer nahi karta. Tax charge ko invoice, payment aur ITC steps se alag rakho. Rates/notifications current law se verify karo.',
      hindi: 'Charge provisions taxable event, liable person, applicable levy और reverse charge या composition जैसे special mechanisms निर्धारित करते हैं। पहले taxable supply establish करें; फिर supplier या recipient की liability तथा notified category/exception जाँचें। केवल registration status हर liability question का उत्तर नहीं देता। Rates और notifications current law से verify करें।',
    },
    example: {
      english: 'A registered business receives a notified service from a supplier whose status differs from the usual domestic supplier. Examine whether reverse charge or another special rule shifts liability.',
      hinglish: 'Registered business notified service receive karta hai aur supplier ka status usual domestic supplier se different hai. Check karo reverse charge ya special rule liability shift karta hai kya.',
      hindi: 'एक registered business ऐसी notified service प्राप्त करता है जिसका supplier usual domestic supplier से अलग स्थिति में है। जाँचें कि reverse charge या कोई special rule liability shift करता है या नहीं।',
    },
    quiz: {
      english: 'Why should the person liable under the charge provision be identified separately from the person who issues the invoice?',
      hinglish: 'Charge provision ke under liable person ko invoice issue karne wale se separately identify kyun karna chahiye?',
      hindi: 'Charge provision के अंतर्गत liable person को invoice issue करने वाले person से अलग क्यों पहचानना चाहिए?',
    },
  },
  {
    key: 'gst-place', pack: 'gst', chapterNumber: 4, title: 'Place of Supply',
    section: 'Section B: Goods and Services Tax',
    aliases: ['place of supply', 'place of supply goods', 'place of supply services', 'inter state supply gst', 'location of supplier', 'bill to ship to'],
    answer: {
      english: 'Place-of-supply rules determine the place where a supply is legally treated as made. Compare that result with the supplier’s location to classify the supply and identify the correct tax component. Goods and services have different default rules and several special rules based on movement, installation, immovable property, events, transport, recipient status or cross-border facts. Do not substitute billing address, payment location or physical presence for the statutory test without authority. Write the relevant category first, then apply the facts and state the resulting place.',
      hinglish: 'Place-of-supply rules batate hain supply legally kahan made mani jayegi. Is result ko supplier location se compare karke intra/inter-State aur tax component decide hota hai. Goods aur services ke default/special rules alag hain—movement, installation, immovable property, event, transport aur cross-border facts matter kar sakte hain. Billing/payment address ko bina statutory test ke place of supply mat mano.',
      hindi: 'Place-of-supply rules तय करते हैं कि supply legally कहाँ made मानी जाएगी। Result की supplier location से तुलना करके intra/inter-State classification और tax component तय होता है। Goods तथा services के default और special rules अलग हैं। Billing address या payment location को statutory test के बिना place of supply न मानें।',
    },
    example: {
      english: 'A supplier bills an office in one State but delivers goods to a customer in another State. Identify the legally relevant place-of-supply rule and do not rely only on the bill-to address.',
      hinglish: 'Supplier ek State ke office ko bill karta hai lekin goods doosri State ke customer ko deliver hote hain. Relevant place-of-supply rule apply karo; sirf bill-to address mat dekho.',
      hindi: 'Supplier एक State के office को bill करता है, लेकिन goods दूसरी State के customer को deliver होते हैं। केवल bill-to address पर निर्भर न रहकर relevant place-of-supply rule लागू करें।',
    },
    quiz: {
      english: 'What is the role of supplier location after the place of supply has been determined?',
      hinglish: 'Place of supply determine hone ke baad supplier location ka role kya hai?',
      hindi: 'Place of supply निर्धारित होने के बाद supplier location की क्या भूमिका है?',
    },
  },
  {
    key: 'gst-exemptions', pack: 'gst', chapterNumber: 5, title: 'Exemptions from GST',
    section: 'Section B: Goods and Services Tax',
    aliases: ['exemptions from gst', 'gst exempt supply', 'nil rated exempt non gst', 'exempted goods services', 'reverse charge exempt'],
    answer: {
      english: 'Exemption analysis begins with the taxable supply and the relevant exemption notification or statutory entry. Distinguish exempt supply, nil-rated supply, non-taxable supply and zero-rated supply; they may have different consequences for registration, invoicing and input tax credit. Exemptions can be conditional on supplier, recipient, service, value, use, documentation or other facts. Read the full entry, definitions, conditions and exclusions as a unit. Do not rely on a remembered list because exemption notifications and conditions can change.',
      hinglish: 'Exemption analysis taxable supply aur relevant notification/statutory entry se start hota hai. Exempt, nil-rated, non-taxable aur zero-rated supply ko same mat samjho; registration, invoice aur ITC consequences alag ho sakte hain. Supplier, recipient, service, value, use aur documents ki conditions poori entry ke saath read karo. Remembered list par rely mat karo.',
      hindi: 'Exemption analysis taxable supply और relevant exemption notification या statutory entry से शुरू होता है। Exempt, nil-rated, non-taxable और zero-rated supply में अंतर करें; इनके registration, invoice तथा ITC consequences अलग हो सकते हैं। Supplier, recipient, service, value, use और documents की सभी conditions पढ़ें।',
    },
    example: {
      english: 'A service appears in an exemption entry but the recipient condition is not satisfied. Apply the full notification instead of treating the service description alone as sufficient.',
      hinglish: 'Service exemption entry mein dikh rahi hai par recipient condition satisfy nahi hoti. Sirf service description par exemption mat do; full notification apply karo.',
      hindi: 'Service exemption entry में दिखती है, लेकिन recipient condition satisfy नहीं होती। केवल service description देखकर exemption न दें; पूरी notification लागू करें।',
    },
    quiz: {
      english: 'Why are exempt, nil-rated, non-taxable and zero-rated supplies not interchangeable terms?',
      hinglish: 'Exempt, nil-rated, non-taxable aur zero-rated supplies interchangeable terms kyun nahi hain?',
      hindi: 'Exempt, nil-rated, non-taxable और zero-rated supplies interchangeable terms क्यों नहीं हैं?',
    },
  },
  {
    key: 'gst-time', pack: 'gst', chapterNumber: 6, title: 'Time of Supply',
    section: 'Section B: Goods and Services Tax',
    aliases: ['time of supply', 'time of supply goods', 'time of supply services', 'gst time of liability', 'advance payment time of supply'],
    answer: {
      english: 'Time of supply fixes when the liability to pay GST arises. Apply the separate rules for goods and services and consider invoice, payment, provision of service, receipt of goods, reverse charge and special situations as relevant. The earliest or other prescribed event matters only as specified by the governing rule; do not apply one universal date formula to every transaction. Keep time of supply separate from place and value of supply. A complete working should list each candidate date, the relevant trigger and the rule that selects the final date.',
      hinglish: 'Time of supply decide karta hai GST liability kab arise hogi. Goods/services ke separate rules apply karo aur invoice, payment, service provision, receipt, reverse charge aur special cases check karo. Har transaction par ek hi date formula apply mat karo. Place aur value of supply alag concepts hain. Working mein candidate dates, trigger aur final selection ka rule likho.',
      hindi: 'Time of supply तय करता है कि GST liability कब arise होगी। Goods और services के अलग rules लागू करें तथा invoice, payment, service provision, receipt, reverse charge और special situations जाँचें। हर transaction पर एक ही date formula लागू न करें। Place तथा value of supply अलग concepts हैं।',
    },
    example: {
      english: 'An advance is received before an invoice is issued. Determine whether the relevant goods or services rule treats that advance as a time-of-supply trigger for the facts and attempt.',
      hinglish: 'Invoice issue hone se pehle advance receive hua. Facts aur attempt ke liye goods/services ka relevant rule advance ko time-of-supply trigger maanta hai ya nahi check karo.',
      hindi: 'Invoice issue होने से पहले advance प्राप्त हुआ। Facts और attempt के अनुसार goods/services का relevant rule advance को time-of-supply trigger मानता है या नहीं, जाँचें।',
    },
    quiz: {
      english: 'Why can the time-of-supply analysis differ between a goods transaction and a service transaction?',
      hinglish: 'Goods aur service transaction mein time-of-supply analysis different kyun ho sakta hai?',
      hindi: 'Goods transaction और service transaction में time-of-supply analysis अलग क्यों हो सकता है?',
    },
  },
  {
    key: 'gst-value', pack: 'gst', chapterNumber: 7, title: 'Value of Supply',
    section: 'Section B: Goods and Services Tax',
    aliases: ['value of supply', 'gst valuation', 'transaction value gst', 'related party valuation gst', 'discount valuation gst', 'incidental expenses value supply'],
    answer: {
      english: 'Value of supply is determined under the statutory valuation framework, beginning with transaction value where the prescribed conditions are met and moving to valuation rules when they are not. Analyse consideration, related-party status, price as the sole consideration, incidental expenses, subsidies, discounts and non-monetary consideration. A commercial discount is not automatically excluded; timing, agreement and evidence can matter. State the valuation method selected and show adjustments separately. Rates and rule-specific treatments must be checked from the current attempt material.',
      hinglish: 'Value of supply statutory valuation framework se decide hota hai. Conditions satisfy hon toh transaction value; otherwise valuation rules apply ho sakte hain. Consideration, related party, sole consideration, incidental expenses, subsidy, discount aur non-monetary consideration check karo. Har commercial discount automatically exclude nahi hota; timing/agreement/evidence matter karte hain. Method aur adjustments separately show karo.',
      hindi: 'Value of supply statutory valuation framework से निर्धारित होती है। Conditions पूरी हों तो transaction value और अन्यथा valuation rules लागू हो सकते हैं। Consideration, related-party status, sole consideration, incidental expenses, subsidy, discounts तथा non-monetary consideration जाँचें। हर commercial discount स्वतः exclude नहीं होता; timing, agreement और evidence महत्वपूर्ण हैं।',
    },
    example: {
      english: 'The invoice price includes packing, freight and a post-supply discount. Analyse each item under the valuation rules and the documentary conditions instead of simply accepting the invoice total.',
      hinglish: 'Invoice price mein packing, freight aur post-supply discount included hai. Har item ko valuation rules aur documents ke basis par analyse karo.',
      hindi: 'Invoice price में packing, freight और post-supply discount शामिल हैं। केवल invoice total स्वीकार करने के बजाय प्रत्येक item को valuation rules तथा documents के आधार पर analyse करें।',
    },
    quiz: {
      english: 'What facts determine whether a discount may be excluded from the value of supply?',
      hinglish: 'Discount ko value of supply se exclude kar sakte hain ya nahi—kaunse facts matter karte hain?',
      hindi: 'Discount को value of supply से exclude किया जा सकता है या नहीं, यह तय करने में कौन-से facts महत्वपूर्ण हैं?',
    },
  },
  {
    key: 'gst-itc', pack: 'gst', chapterNumber: 8, title: 'Input Tax Credit',
    section: 'Section B: Goods and Services Tax',
    aliases: ['input tax credit', 'itc under gst', 'gst credit eligibility', 'blocked credit', 'reversal of itc', 'input tax credit conditions'],
    answer: {
      english: 'Input tax credit prevents cascading by allowing eligible tax paid on inward supplies to be used against output tax, subject to statutory conditions and restrictions. Verify possession of prescribed evidence, receipt of supply, supplier reporting or matching requirements where applicable, tax payment conditions, return filing and business use. Blocked credits, exempt or non-business use, mixed use and reversal rules can reduce the available credit. Credit entitlement is not established merely because an invoice exists. Reconcile books, invoices, portal data and returns, and verify current restrictions for the attempt.',
      hinglish: 'ITC eligible inward supplies par paid tax ko output tax ke against use karne deta hai, conditions/restrictions ke saath. Invoice/evidence, receipt, supplier reporting, tax payment conditions, return filing aur business use verify karo. Blocked credit, exempt/non-business use aur reversal rules credit reduce kar sakte hain. Sirf invoice hone se ITC automatic nahi milta; books, portal aur returns reconcile karo.',
      hindi: 'ITC eligible inward supplies पर paid tax को output tax के against उपयोग करने देता है, लेकिन statutory conditions और restrictions के अधीन। Invoice/evidence, receipt, supplier reporting, tax payment conditions, return filing तथा business use verify करें। Blocked credits, exempt/non-business use और reversal rules credit घटा सकते हैं। केवल invoice होने से ITC स्वतः नहीं मिलता।',
    },
    example: {
      english: 'A business holds an invoice for a purchase used partly for taxable business and partly for personal purposes. Test eligibility, business use, blocked-credit rules and any required apportionment or reversal.',
      hinglish: 'Business ke paas purchase invoice hai jo partly taxable business aur partly personal use mein gaya. Eligibility, business use, blocked credit aur apportionment/reversal test karo.',
      hindi: 'Business के पास ऐसा purchase invoice है जिसका उपयोग taxable business और personal purpose दोनों में हुआ। Eligibility, business use, blocked-credit rules तथा apportionment/reversal जाँचें।',
    },
    quiz: {
      english: 'Why is possession of a tax invoice necessary but not always sufficient for claiming input tax credit?',
      hinglish: 'Tax invoice hona ITC ke liye necessary hai, par hamesha sufficient kyun nahi?',
      hindi: 'ITC claim करने के लिए tax invoice होना आवश्यक है, लेकिन हमेशा पर्याप्त क्यों नहीं?',
    },
  },
  {
    key: 'gst-registration', pack: 'gst', chapterNumber: 9, title: 'Registration',
    section: 'Section B: Goods and Services Tax',
    aliases: ['gst registration', 'registration under gst', 'aggregate turnover registration', 'compulsory registration', 'casual taxable person', 'non resident taxable person'],
    answer: {
      english: 'GST registration analysis considers the person, nature and location of business, aggregate turnover, compulsory-registration categories, exemptions and special registrations. Turnover must be computed using the statutory definition and relevant registrations, not simply one bank account or one branch ledger. Separate liability to register from the effective date, application process, amendment, cancellation and revocation. Voluntary registration may create ongoing compliance duties. Thresholds, categories and effective dates can change and must be checked from the applicable notification and attempt material.',
      hinglish: 'GST registration person, business nature/location, aggregate turnover, compulsory categories, exemptions aur special registrations par depend karta hai. Turnover statutory definition se calculate karo, sirf ek bank/branch se nahi. Registration liability, effective date, application, amendment, cancellation aur revocation alag steps hain. Voluntary registration se bhi ongoing compliance aa sakti hai. Thresholds current notification se verify karo.',
      hindi: 'GST registration person, business की nature/location, aggregate turnover, compulsory categories, exemptions और special registrations पर निर्भर करता है। Turnover statutory definition से calculate करें, केवल एक bank account या branch से नहीं। Registration liability, effective date, application, amendment, cancellation और revocation अलग steps हैं। Thresholds current notification से verify करें।',
    },
    example: {
      english: 'A business operates through multiple locations under one PAN and has both taxable and exempt supplies. Determine aggregate turnover using the applicable statutory definition before testing registration liability.',
      hinglish: 'Business ek PAN ke under multiple locations aur taxable/exempt supplies operate karta hai. Registration threshold test se pehle statutory definition ke according aggregate turnover calculate karo.',
      hindi: 'Business एक PAN के अंतर्गत multiple locations तथा taxable/exempt supplies operate करता है। Registration threshold test करने से पहले statutory definition के अनुसार aggregate turnover calculate करें।',
    },
    quiz: {
      english: 'Why is aggregate turnover not necessarily equal to taxable turnover or the sales shown by one branch?',
      hinglish: 'Aggregate turnover taxable turnover ya ek branch ki sales ke equal kyun zaroori nahi hai?',
      hindi: 'Aggregate turnover का taxable turnover या एक branch की sales के बराबर होना आवश्यक क्यों नहीं है?',
    },
  },
  {
    key: 'gst-invoice', pack: 'gst', chapterNumber: 10, title: 'Tax Invoice; Credit and Debit Notes',
    section: 'Section B: Goods and Services Tax',
    aliases: ['tax invoice credit and debit notes', 'gst tax invoice', 'credit note under gst', 'debit note under gst', 'bill of supply', 'revised invoice gst'],
    answer: {
      english: 'GST documents evidence the nature, value, tax and timing of a supply and support return reporting and credit claims. Select the correct document—tax invoice, bill of supply, receipt or payment voucher, credit note, debit note or other prescribed document—based on the transaction. A credit or debit note adjusts an earlier supply only when the statutory conditions are satisfied and must be reflected in the prescribed records and returns. Do not use a commercial credit note automatically as a GST adjustment. Verify particulars, timing and reporting rules for the attempt.',
      hinglish: 'GST documents supply ki nature, value, tax aur timing prove karte hain aur returns/ITC support karte hain. Transaction ke basis par correct document choose karo—tax invoice, bill of supply, voucher, credit/debit note. Credit/debit note GST adjust tabhi karega jab statutory conditions satisfy hon aur required records/returns mein reflect ho. Commercial credit note automatically GST adjustment nahi hota.',
      hindi: 'GST documents supply की nature, value, tax और timing का evidence देते हैं तथा returns/ITC को support करते हैं। Transaction के अनुसार सही document चुनें—tax invoice, bill of supply, voucher, credit note या debit note। Credit/debit note GST तभी adjust करता है जब statutory conditions पूरी हों और prescribed records/returns में reflect हो।',
    },
    example: {
      english: 'Goods are returned after the original invoice. Determine whether the supplier should issue a GST credit note or use another accounting adjustment, and verify the relevant reporting conditions.',
      hinglish: 'Original invoice ke baad goods return ho gaye. Decide karo GST credit note chahiye ya accounting adjustment, aur reporting conditions verify karo.',
      hindi: 'Original invoice के बाद goods return हो गए। तय करें कि GST credit note चाहिए या अन्य accounting adjustment और reporting conditions verify करें।',
    },
    quiz: {
      english: 'Why is a commercial credit note not automatically the same as a GST credit note?',
      hinglish: 'Commercial credit note aur GST credit note automatically same kyun nahi hote?',
      hindi: 'Commercial credit note और GST credit note स्वतः समान क्यों नहीं होते?',
    },
  },
  {
    key: 'gst-accounts-records', pack: 'gst', chapterNumber: 11, title: 'Accounts and Records',
    section: 'Section B: Goods and Services Tax',
    aliases: ['accounts and records gst', 'gst books of account', 'records under gst', 'stock records gst', 'electronic records gst'],
    answer: {
      english: 'GST record-keeping supports verification of outward and inward supplies, stock, input credit, tax payable, tax paid and other prescribed details. Identify who must maintain records, the relevant place, format, supporting documents, retention period and access requirements. Records should allow a clear audit trail from source documents to returns and ledger balances. Electronic records still require integrity, accessibility and reliable backup. A missing record can affect the taxpayer’s ability to substantiate a position even where the underlying transaction occurred. Current retention periods and special requirements must be verified.',
      hinglish: 'GST records outward/inward supplies, stock, ITC, tax payable/paid aur details verify karne mein help karte hain. Kaun maintain karega, place, format, supporting documents, retention aur access requirements identify karo. Source documents se returns/ledger tak audit trail clear hona chahiye. Electronic records mein integrity, access aur backup zaroori hain. Current retention period exact rule se check karo.',
      hindi: 'GST records outward/inward supplies, stock, ITC, tax payable/paid और prescribed details verify करने में सहायता करते हैं। कौन records maintain करेगा, place, format, supporting documents, retention तथा access requirements पहचानें। Source documents से returns और ledger तक audit trail clear होना चाहिए। Electronic records में integrity, accessibility और backup आवश्यक हैं।',
    },
    example: {
      english: 'A taxpayer’s return claims input credit but the purchase register and receipt records are incomplete. Explain what reconciliation and supporting evidence are needed before defending the claim.',
      hinglish: 'Return mein ITC claim hai par purchase register aur receipt records incomplete hain. Claim defend karne se pehle reconciliation aur supporting evidence identify karo.',
      hindi: 'Return में ITC claim है, लेकिन purchase register और receipt records incomplete हैं। Claim defend करने से पहले reconciliation और supporting evidence पहचानें।',
    },
    quiz: {
      english: 'How do books, source documents, electronic records and GST returns support one another in an audit trail?',
      hinglish: 'Books, source documents, electronic records aur GST returns audit trail mein ek doosre ko kaise support karte hain?',
      hindi: 'Audit trail में books, source documents, electronic records और GST returns एक-दूसरे को कैसे support करते हैं?',
    },
  },
  {
    key: 'gst-eway', pack: 'gst', chapterNumber: 12, title: 'E-Way Bill',
    section: 'Section B: Goods and Services Tax',
    aliases: ['e way bill', 'eway bill', 'gst e-way bill', 'movement of goods eway bill', 'transport document gst'],
    answer: {
      english: 'The e-way bill framework tracks specified movement of goods and links the consignment with prescribed documents and transport details. Determine whether the movement and goods fall within the rule, who is responsible for generating or carrying the document, and whether any exception applies. Distinguish the e-way bill from a tax invoice and from the underlying supply; one document does not replace the other. Distance, validity, vehicle details, cancellation and extension rules are operational and attempt-sensitive. Never assume a threshold or validity period from memory.',
      hinglish: 'E-way bill specified goods movement track karta hai aur consignment ko prescribed documents/transport details se link karta hai. Movement/goods rule mein aate hain ya nahi, responsible person kaun hai aur exception hai kya—check karo. E-way bill tax invoice ya underlying supply ka replacement nahi. Distance, validity, vehicle, cancellation/extension current rules se verify karo.',
      hindi: 'E-way bill framework specified goods movement को track करता है और consignment को prescribed documents तथा transport details से जोड़ता है। Movement/goods rule में आते हैं या नहीं, responsible person कौन है और exception है या नहीं, जाँचें। E-way bill tax invoice या underlying supply का replacement नहीं है। Validity और operational rules current law से verify करें।',
    },
    example: {
      english: 'A consignment is moved through a transporter and the vehicle changes during transit. Identify who must update the transport details and what document should accompany the goods.',
      hinglish: 'Consignment transporter se move hota hai aur transit mein vehicle change hota hai. Transport details update karne ki responsibility aur accompanying documents identify karo.',
      hindi: 'Consignment transporter के माध्यम से move होता है और transit में vehicle बदलता है। Transport details update करने की responsibility तथा accompanying documents पहचानें।',
    },
    quiz: {
      english: 'Why should e-way bill compliance be tested separately from invoice and tax-payment compliance?',
      hinglish: 'E-way bill compliance ko invoice aur tax-payment compliance se separately test kyun karna chahiye?',
      hindi: 'E-way bill compliance को invoice और tax-payment compliance से अलग क्यों जाँचना चाहिए?',
    },
  },
  {
    key: 'gst-payment', pack: 'gst', chapterNumber: 13, title: 'Payment of Tax',
    section: 'Section B: Goods and Services Tax',
    aliases: ['payment of tax gst', 'gst payment', 'electronic cash ledger', 'electronic credit ledger', 'electronic liability register', 'utilisation of itc'],
    answer: {
      english: 'GST payment is made through the prescribed ledgers and permitted modes, using cash and eligible credit subject to utilisation rules. Distinguish tax liability from interest, penalty, fee and other amounts because credit may not be usable for every category. Reconcile the liability register, cash ledger, credit ledger, challans and return data before concluding that tax has been paid. The order and restrictions for using credit depend on the statutory framework and current changes. Show the liability, available credit, cash balance and final payment separately.',
      hinglish: 'GST payment prescribed ledgers/modes se hota hai; cash aur eligible ITC utilisation rules ke according use hote hain. Tax liability ko interest, penalty, fee se separate rakho; har amount ke against credit use nahi ho sakta. Liability register, cash ledger, credit ledger, challan aur return reconcile karo. Available credit aur cash payment separately show karo.',
      hindi: 'GST payment prescribed ledgers और permitted modes से होता है; cash तथा eligible credit utilisation rules के अनुसार उपयोग होते हैं। Tax liability को interest, penalty और fee से अलग रखें क्योंकि हर amount के लिए credit उपयोग नहीं हो सकता। Liability register, cash ledger, credit ledger, challans और return data reconcile करें।',
    },
    example: {
      english: 'A taxpayer has output tax, eligible input credit, interest and a late fee. Prepare separate balances and apply credit only to the categories permitted by the current utilisation rules.',
      hinglish: 'Taxpayer par output tax, eligible ITC, interest aur late fee hai. Separate balances banao aur ITC sirf permitted categories mein use karo.',
      hindi: 'Taxpayer पर output tax, eligible ITC, interest और late fee है। अलग balances बनाएं और ITC केवल permitted categories में उपयोग करें।',
    },
    quiz: {
      english: 'Why must tax, interest, penalty and fee be shown separately in a GST payment working?',
      hinglish: 'GST payment working mein tax, interest, penalty aur fee ko separate kyun show karna chahiye?',
      hindi: 'GST payment working में tax, interest, penalty और fee अलग-अलग क्यों दिखाने चाहिए?',
    },
  },
  {
    key: 'gst-tds-tcs', pack: 'gst', chapterNumber: 14, title: 'Tax Deduction at Source and Collection of Tax at Source',
    section: 'Section B: Goods and Services Tax',
    aliases: ['gst tds tcs', 'tax deduction at source gst', 'tax collection at source gst', 'tds under gst', 'tcs under gst', 'ecommerce operator tcs'],
    answer: {
      english: 'GST TDS and TCS are distinct collection mechanisms with different liable persons, transaction conditions, timing and reporting. TDS is associated with specified deductors and qualifying supplies/contracts; TCS is associated with specified electronic commerce operator situations. Identify the statutory role first, then test the threshold, nature of supply, location, amount, timing, registration and statement requirements. Amounts deducted or collected are credited through the prescribed process and must reconcile with the supplier’s records. Rates, thresholds and exclusions are current-law items and must be verified.',
      hinglish: 'GST TDS aur TCS separate collection mechanisms hain. TDS specified deductors/qualifying supplies se linked hai; TCS specified e-commerce operator situations se. Pehle statutory role identify karo, phir threshold, supply nature, location, amount, timing, registration aur statement conditions test karo. Deducted/collected amount prescribed credit process se reconcile hota hai. Rate/threshold current law se verify karo.',
      hindi: 'GST TDS और TCS अलग collection mechanisms हैं। TDS specified deductors तथा qualifying supplies से जुड़ा है; TCS specified e-commerce operator situations से। पहले statutory role पहचानें, फिर threshold, supply nature, location, amount, timing, registration और statement requirements जाँचें। Rates तथा exclusions current law से verify करें।',
    },
    example: {
      english: 'A government department makes a qualifying contract payment while an online marketplace facilitates third-party sales. Analyse the department’s possible TDS role separately from the operator’s possible TCS role.',
      hinglish: 'Government department qualifying contract payment karta hai aur marketplace third-party sales facilitate karta hai. Department ka TDS aur operator ka TCS role separately analyse karo.',
      hindi: 'Government department qualifying contract payment करता है और marketplace third-party sales facilitate करता है। Department के संभावित TDS role और operator के संभावित TCS role का अलग analysis करें।',
    },
    quiz: {
      english: 'Why are GST TDS and GST TCS not interchangeable even though both involve collection of tax?',
      hinglish: 'GST TDS aur GST TCS dono tax collection hain, phir bhi interchangeable kyun nahi hain?',
      hindi: 'GST TDS और GST TCS दोनों tax collection से जुड़े हैं, फिर भी interchangeable क्यों नहीं हैं?',
    },
  },
  {
    key: 'gst-returns', pack: 'gst', chapterNumber: 15, title: 'Returns',
    section: 'Section B: Goods and Services Tax',
    aliases: ['gst returns', 'returns under gst', 'gstr return', 'outward supply return', 'annual return gst', 'return filing gst'],
    answer: {
      english: 'GST returns report outward supplies, inward-supply information, tax liability, input credit and payment in the prescribed form and frequency. Determine the taxpayer category and return type before considering due dates and contents. Reconcile invoices, books, portal statements, credit notes, tax ledgers and payment records; a mismatch can affect credit or liability even when the original transaction is genuine. Late filing, omissions, amendments and corrections have separate consequences and time windows. Forms, due dates, late fees and special procedures are updated periodically and must be checked for the exact tax period.',
      hinglish: 'GST returns outward supplies, inward data, tax liability, ITC aur payment report karte hain. Taxpayer category aur return type identify karke due date/content dekho. Invoices, books, portal statements, credit/debit notes, ledgers aur payments reconcile karo. Mismatch se ITC/liability affect ho sakti hai. Late filing, omissions aur corrections ke separate rules hain; forms/due dates current period se verify karo.',
      hindi: 'GST returns outward supplies, inward information, tax liability, ITC और payment को prescribed form तथा frequency में report करते हैं। Due dates और contents देखने से पहले taxpayer category और return type पहचानें। Invoices, books, portal statements, credit/debit notes, ledgers तथा payment records reconcile करें। Forms और due dates exact tax period के अनुसार verify करें।',
    },
    example: {
      english: 'The sales register and outward-supply return do not agree because a credit note was recorded in a different period. Reconcile the document date, statutory reporting window and return treatment before correcting the mismatch.',
      hinglish: 'Sales register aur outward-supply return mismatch hain kyunki credit note different period mein record hua. Correction se pehle document date, reporting window aur return treatment reconcile karo.',
      hindi: 'Sales register और outward-supply return में mismatch है क्योंकि credit note अलग period में record हुआ। Correction से पहले document date, reporting window और return treatment reconcile करें।',
    },
    quiz: {
      english: 'Why should a GST return be reconciled with books, invoices, portal data and payment ledgers rather than checked in isolation?',
      hinglish: 'GST return ko books, invoices, portal data aur payment ledgers ke saath reconcile karna kyun zaroori hai?',
      hindi: 'GST return को books, invoices, portal data और payment ledgers के साथ reconcile करना क्यों आवश्यक है?',
    },
  },
];

function normalize(value: string): string {
  return String(value || '').toLocaleLowerCase('en-IN')
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isAttemptSensitive(message: string): boolean {
  return /\b(latest|current|currently applicable|as of today|amendment|amended|statutory update|notification|circular|corrigendum|finance act|assessment year|applicable for (?:may|september|january)|tax rate|slab|threshold|limit|due date|filing deadline|interest rate|penalty|section \d|rule \d|effective from|in force)\b/i.test(message)
    || /\b(धारा|अधिसूचना|संशोधन|वर्तमान दर|सीमा|अंतिम तारीख)\b/u.test(message);
}

function matchMode(message: string): ParakhIntermediateLawTaxMode {
  if (/\b(quiz|test me|ask me|practice question|question me)\b|प्रश्न पूछो|टेस्ट लो|सवाल पूछो/i.test(message)) return 'quiz';
  if (/\b(example|illustrate|for example|case study|scenario)\b|उदाहरण|मिसाल/i.test(message)) return 'example';
  if (/\b(simple|simpler|easy language|in simple words|easy words)\b|आसान भाषा|सरल भाषा|सरल शब्दों में/i.test(message)) return 'simpler';
  return 'answer';
}

function sourceFor(pack: PackKey): { title: string; url: string } {
  if (pack === 'corporate_law') return {
    title: 'ICAI Intermediate Paper 2: Corporate and Other Laws — applicable for May 2027 exam onwards',
    url: PARAKH_INTERMEDIATE_LAW_SOURCE_URL,
  };
  if (pack === 'income_tax') return {
    title: 'ICAI Intermediate Paper 3 Section A: Income-tax Law — May 2027/September 2027/January 2028',
    url: PARAKH_INTERMEDIATE_INCOME_TAX_SOURCE_URL,
  };
  return {
    title: 'ICAI Intermediate Paper 3 Section B: Goods and Services Tax — May 2027/September 2027/January 2028',
    url: PARAKH_INTERMEDIATE_GST_SOURCE_URL,
  };
}

function applicabilityFor(pack: PackKey): string {
  return pack === 'corporate_law'
    ? 'Paper 2 catalogue is marked Applicable for May 2027 Exam Onwards.'
    : 'Paper 3 Section A/B catalogues list May 2027, September 2027 and January 2028 examinations.';
}

export type ParakhIntermediateLawTaxMatch = {
  topicId: string;
  topicTitle: string;
  course: 'CA_INTERMEDIATE';
  paperCode: 'INT-G1-P2' | 'INT-G1-P3';
  section: string;
  chapterNumber: number;
  syllabusApplicability: string;
  contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';
  benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED';
  mode: ParakhIntermediateLawTaxMode;
  answer: string;
  source: { title: string; url: string };
};

export function searchParakhIntermediateLawTaxKnowledge(input: {
  message: string;
  course: string;
  language: ParakhIntermediateLawTaxLanguage;
}): ParakhIntermediateLawTaxMatch | null {
  const message = String(input.message || '').trim();
  if (!message || input.course !== 'CA_INTERMEDIATE' || isAttemptSensitive(message)) return null;
  const normalized = ' ' + normalize(message) + ' ';
  const candidates = CHAPTERS.flatMap((chapter) => chapter.aliases.map((alias) => ({
    chapter, alias: normalize(alias),
  }))).filter((item) => item.alias && normalized.includes(' ' + item.alias + ' '));
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  const chapter = candidates[0]?.chapter;
  if (!chapter) return null;
  const mode = matchMode(message);
  const text = mode === 'example' ? chapter.example[input.language]
    : mode === 'quiz' ? chapter.quiz[input.language]
      : mode === 'simpler' ? simpleExplanation(chapter.answer[input.language], input.language)
        : chapter.answer[input.language];
  const packSource = sourceFor(chapter.pack);
  return {
    topicId: 'intermediate-' + chapter.key,
    topicTitle: chapter.title,
    course: 'CA_INTERMEDIATE',
    paperCode: chapter.pack === 'corporate_law' ? 'INT-G1-P2' : 'INT-G1-P3',
    section: chapter.section,
    chapterNumber: chapter.chapterNumber,
    syllabusApplicability: applicabilityFor(chapter.pack),
    contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
    mode,
    answer: text,
    source: packSource,
  };
}

function simpleExplanation(answer: string, language: ParakhIntermediateLawTaxLanguage): string {
  const sentences = answer.match(/[^.!?।]+[.!?।]?/gu) || [answer];
  const concise = sentences.slice(0, 2).join(' ').trim();
  const prefix = language === 'hindi'
    ? 'सरल शब्दों में: '
    : language === 'hinglish'
      ? 'Simple words mein: '
      : 'In simple terms: ';
  return prefix + concise;
}

export function buildParakhIntermediateLawTaxReply(
  result: ParakhIntermediateLawTaxMatch,
  language: ParakhIntermediateLawTaxLanguage,
): string {
  const heading = language === 'hindi' ? 'अध्याय' : 'Chapter';
  const applicability = language === 'hindi'
    ? '\n\n**पाठ्यक्रम स्रोत:** '
    : '\n\n**Syllabus source:** ';
  const sourceNote = language === 'hindi'
    ? result.source.title + '। Exact attempt, statutory update, RTP, corrigendum और exclusions जाँचें।'
    : language === 'hinglish'
      ? result.source.title + '. Apne exact attempt ka statutory update, RTP, corrigendum aur exclusions check karo.'
      : result.source.title + '. Verify the exact attempt edition, statutory update, RTP, corrigendum and exclusions.';
  const review = language === 'hindi'
    ? '\n\n**Content status:** यह original PARAKH author draft है; qualified CA law/tax reviewer ने अभी verify नहीं किया है। इसमें rates, limits या current statutory conclusions certify नहीं किए गए हैं।'
    : language === 'hinglish'
      ? '\n\n**Content status:** Ye original PARAKH author draft hai; qualified CA law/tax reviewer ne abhi verify nahi kiya. Isme rates, limits ya current statutory conclusions certify nahi kiye gaye hain.'
      : '\n\n**Content status:** This is an original PARAKH author draft and has not yet been verified by a qualified CA law/tax reviewer. It does not certify current rates, limits or statutory conclusions.';
  return '**' + heading + ' ' + result.chapterNumber + ': ' + result.topicTitle + '**\n\n'
    + result.answer + applicability + sourceNote + review;
}

export function getParakhIntermediateLawTaxInventory() {
  const definitions = [
    { pack: 'corporate_law' as const, paperCode: 'INT-G1-P2', title: 'Corporate and Other Laws', sourceUrl: PARAKH_INTERMEDIATE_LAW_SOURCE_URL, sectionCount: 2 },
    { pack: 'income_tax' as const, paperCode: 'INT-G1-P3', title: 'Taxation — Section A: Income-tax Law', sourceUrl: PARAKH_INTERMEDIATE_INCOME_TAX_SOURCE_URL, sectionCount: 1 },
    { pack: 'gst' as const, paperCode: 'INT-G1-P3', title: 'Taxation — Section B: Goods and Services Tax', sourceUrl: PARAKH_INTERMEDIATE_GST_SOURCE_URL, sectionCount: 1 },
  ];
  return {
    course: 'CA_INTERMEDIATE' as const,
    sourceCheckedAt: '2026-11-08',
    humanReviewedContentCount: 0 as const,
    humanReviewedBenchmarkCount: 0 as const,
    papers: definitions.map((paper) => {
      const chapters = CHAPTERS.filter((chapter) => chapter.pack === paper.pack);
      return {
        ...paper,
        chapterCount: chapters.length,
        authoredContentCount: chapters.length,
        benchmarkPromptCount: chapters.length * 5,
        chapters: chapters.map((chapter) => ({
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          section: chapter.section,
          contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' as const,
          benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' as const,
        })),
      };
    }),
    totalChapterCount: CHAPTERS.length,
    totalAuthoredContentCount: CHAPTERS.length,
    totalBenchmarkPromptCount: CHAPTERS.length * 5,
  };
}

export const PARAKH_INTERMEDIATE_LAW_TAX_BENCHMARKS = CHAPTERS.flatMap((chapter) => {
  const families = [
    ['core_concept', 'Explain the controlling concepts and distinctions in ' + chapter.title + '.'],
    ['unseen_application', 'Apply ' + chapter.title + ' to a new fact pattern; state assumptions and the conclusion.'],
    ['exam_presentation', 'Prepare a structured CA Intermediate answer on ' + chapter.title + ' with issue, rule, application and conclusion.'],
    ['edge_case', 'Identify an edge case or common error in ' + chapter.title + ' and explain how to avoid it.'],
    ['attempt_source_sensitivity', 'Verify the exact attempt applicability and current legal treatment for ' + chapter.title + ' using primary sources.'],
  ] as const;
  return families.map(([family, question], index) => ({
    id: chapter.key + '-' + (index + 1),
    chapterKey: chapter.key,
    paperCode: chapter.pack === 'corporate_law' ? 'INT-G1-P2' : 'INT-G1-P3',
    section: chapter.section,
    family,
    question,
    status: 'PROMPT_ONLY_NOT_EVALUATED' as const,
  }));
});
