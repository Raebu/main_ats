# UK Recruitment Compliance Review — Stage 8

**Review date:** 27 September 2026  
**Scope:** Raeburn Talent recruitment workflows operated in Great Britain.  
**Status:** Engineering/compliance control review complete. Independent qualified legal sign-off can be recorded in the platform's compliance-signoff register before external production.

This document records the product and engineering controls implemented against current official guidance. It is not a substitute for advice from a solicitor on a particular employment decision, contract, dispute or unusual recruitment scenario.

## 1. Equality and reasonable adjustments

Current GOV.UK guidance states that recruitment must not discriminate against disabled applicants and that reasonable adjustments must be made where reasonable. Recruitment questions about health/disability are restricted to permitted purposes such as determining whether an applicant can take part in an assessment or identifying reasonable adjustments.

Raeburn Talent controls:
- accessibility preferences are captured separately from selection evidence;
- blind review can hide identity fields;
- later-stage rejection requires job-related evidence and a configured reason;
- AI instructions prohibit protected-characteristic inference and autonomous hire/reject decisions;
- adjustment information must not be used as negative selection evidence;
- governance monitoring uses aggregated cohorts and explicitly does not infer discrimination from a statistical difference alone.

Official references:
- https://www.gov.uk/recruitment-disabled-people/reasonable-adjustments
- https://www.gov.uk/recruitment-disabled-people
- https://www.gov.uk/rights-disabled-person/employment

## 2. Data protection in recruitment

The ICO's recruitment and selection guidance covers UK GDPR/Data Protection Act obligations across sourcing, applications, assessment, vetting, retention and deletion. The ICO notes that recruitment can involve sensitive information and multiple organisations/providers.

Raeburn Talent controls:
- versioned privacy notices;
- purpose/lawful-basis register;
- legitimate-interest assessment register;
- record of processing activities;
- subprocessor register;
- data map and data-residency register;
- category-specific retention policies and legal holds;
- public consent events for optional analytics, recruitment marketing and talent-pool processing;
- suppression registry;
- identity verification and explicit approval before DSAR/deletion/anonymisation fulfilment;
- tenant-encrypted DSAR results with expiry;
- human-readable HTML and machine-readable JSON DSAR exports;
- audited privacy requests, decisions and exports;
- sensitive candidate/privacy/document/offer/AI reads audited at the API gateway.

Official references:
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/

**Change watch:** the ICO states that recruitment guidance is being updated for the Data (Use and Access) Act 2025, with updated recruitment and selection guidance expected in Winter 2026. This control review must therefore be revisited when final guidance is published.

## 3. AI and automated recruitment

Raeburn Talent's architectural rule remains that AI is advisory. It is not the system of record for a hire/reject decision and core recruitment functions remain available when AI is disabled.

Controls:
- model/provider/version and prompt provenance on AI runs;
- AI model registry with approval and review dates;
- model-change review with validation evidence and risk assessment;
- candidate impact assessments;
- production option to block unapproved models;
- human confirmation before proposed actions;
- no autonomous hire/reject;
- no opaque candidate ranking;
- no protected-trait inference;
- evidence citations to underlying recruitment records;
- aggregated fairness monitoring;
- consistency audits;
- decision evidence retained independently of AI output.

The ICO recommends assessing privacy risk, data minimisation, fairness/bias, transparency and the ability to challenge automated outcomes. Current 2026 ICO material also emphasises safeguards, transparency and human review/challenge where automated decision-making is used.

Official references:
- https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2024/11/thinking-of-using-ai-to-assist-recruitment-our-key-data-protection-considerations/
- https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/03/here-s-what-jobseekers-need-to-know-about-automated-recruitment-decisions/
- https://ico.org.uk/about-the-ico/what-we-do/recruitment-rewired/

## 4. Agency workers and recruitment suppliers

For agency engagements the system records supplier approval, terms, vacancy access, ownership periods, submissions, placement/invoice history, supplier performance and an explicit compliance-review record.

The compliance review template prompts the reviewer to consider:
- approved-supplier status and contractual terms;
- responsibility for worker information;
- day-one and qualifying-period controls under the Agency Workers Regulations;
- candidate ownership and privacy terms;
- evidence and review date.

Official references:
- https://www.gov.uk/government/publications/agency-workers-regulations-2010-guidance-for-recruiters/agency-workers-regulations-2010-guidance
- https://www.gov.uk/government/collections/information-and-guidance-for-employment-businesses-and-agencies

## 5. Contractors and off-payroll working

Raeburn Talent stores contractor classification, day rate, term/end date, IR35 information and supplier/PSC details. A dedicated compliance review record prompts an authorised reviewer to document the engagement classification, employment-status/tax responsibility, off-payroll applicability and supporting evidence before approval.

The platform must not determine IR35 status from AI inference. Responsibility depends on the engagement and client circumstances and should be recorded by an authorised human reviewer.

Official references:
- https://www.gov.uk/guidance/understanding-off-payroll-working-ir35
- https://www.gov.uk/guidance/off-payroll-working-for-clients

## 6. Decision evidence and fairness

Later-stage rejection from REVIEW, SHORTLIST, INTERVIEW, FINAL_INTERVIEW or OFFER is blocked unless:
1. an active configured rejection-reason code is selected;
2. a written rationale is supplied; and
3. job-related supporting evidence is recorded.

Fairness monitoring is deliberately separated from individual candidate scoring. Aggregated cohort monitoring has a minimum-group-size control and returns a review signal, not a legal conclusion or automated hiring action.

## 7. Required governance sign-offs before external production

The following should have an APPROVED record in `compliance_signoffs` for the deployed policy/version:
- recruitment privacy notice and lawful-basis schedule;
- reasonable-adjustment handling process;
- candidate retention/deletion schedule;
- agency engagement policy if agencies are used;
- contractor/off-payroll process if contractors are used;
- AI recruitment/candidate-impact assessment before any consequential AI use;
- relevant employment templates and contractual documents.

The sign-off record stores reviewer name, role, organisation, evidence reference, decision date and next review date.

## 8. Review triggers

Repeat this review when:
- ICO final recruitment/selection guidance implementing DUAA changes is published;
- a new country or legal entity is enabled;
- a new AI model/provider or materially changed model is introduced;
- automated decision-making becomes more consequential;
- a new job-board, assessment, background-check, e-sign, HRIS or payroll provider changes data flows;
- retention, consent or lawful-basis policy changes;
- a material security/privacy incident occurs;
- legislation or official regulatory guidance materially changes.
