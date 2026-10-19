/**
 * Verian's six areas of expertise. Names and order match veriangroup.com;
 * descriptions are written for this concept from Verian's own pages.
 */
export interface Expertise {
  slug: string;
  name: string;
  /** A short name for tight spaces (the centre of the policy-cycle diagram). */
  label: string;
  short: string;
  url: string;
  /** Library topic tags that best represent this area (used to find related work). */
  topics: string[];
  /** For an area with no topic tag of its own: a search that finds its related work instead. */
  relatedQuery?: string;
  /** Where it sits in the policy cycle (0 understand, 1 design, 2 deliver, 3 evaluate). */
  stages: number[];
  /** A fuller, paraphrased description from Verian's page for this area. */
  summary?: string[];
  /** Capabilities named on Verian's page. */
  services?: string[];
  /** Facts stated on Verian's page, with exact figures. */
  facts?: string[];
}

export const EXPERTISE: Expertise[] = [
  {
    slug: "evidence",
    name: "Evidence",
    label: "Evidence",
    short: "The evidence base governments and multilateral organisations use to design policy and make decisions.",
    url: "https://www.veriangroup.com/expertise/evidence",
    topics: ["Evidence"],
    stages: [0, 3],
    summary: [
      "Verian builds the evidence that governments and multilateral organisations use to make policy, and runs long-term measures of social change for leading universities. Classical social research is combined with mixed-mode and digital methods, and primary data is collected on every continent.",
      "Researchers, survey methodologists, statisticians and data scientists work as one team across disciplines and countries. The aim is to reach every part of society, not only people who are online, and to innovate carefully so long-running time series stay comparable.",
    ],
    services: [
      "Baseline data for policy research: values, attitudes, resources and needs",
      "National, official and international statistics",
      "Longitudinal programmes, from household and life-course studies to digital panels",
      "Multi-country research, with specialist translation and in-country testing",
      "Qualitative and deliberative research on sensitive policy questions",
      "Verian Context: machine learning, data imputation and context around survey data",
    ],
    facts: [
      "Primary data collected on every continent",
      "Hundreds of researchers, methodologists, statisticians and data scientists working as one team",
      "Verian Context, its data science platform, developed in 2020",
    ],
  },
  {
    slug: "policy-development-and-evaluation",
    name: "Policy Development and Evaluation",
    label: "Evaluation",
    short: "Better design, delivery and evaluation of policies, programmes and interventions, at every stage of their life.",
    url: "https://www.veriangroup.com/expertise/policy-development-and-evaluation",
    topics: ["Policy Development & Evaluation"],
    stages: [1, 3],
    summary: [
      "Specialist policy formation, service design and evaluation consultancy, aimed at better public policy and services through understanding what works, and why.",
      "Interdisciplinary teams combine subject expertise in areas such as health, education, employment, transport and migration with primary and secondary evidence, design methods and capacity building. Evaluations are rigorous and collaborative, drawing on behavioural science, systems thinking, adaptive learning and economic analysis, with a focus on value for money.",
    ],
    services: [
      "Policy formation and service design",
      "Design thinking, customer journey mapping and whole-system approaches",
      "Programme monitoring and evaluation",
      "Value for money and economic evaluation",
      "Monitoring, Evaluation and Learning (MEL) for international programmes",
      "Evaluation frameworks and capacity building for future evaluations",
    ],
  },
  {
    slug: "behavioural-and-communications",
    name: "Behavioural and Communications",
    label: "Behaviour change",
    short: "How citizens actually behave, which levers drive change, and communications that reach diverse audiences.",
    url: "https://www.veriangroup.com/expertise/behavioural-change-and-communications",
    topics: ["Behavioural & Communications"],
    stages: [1, 2],
    summary: [
      "Insight into what drives citizens' decisions, solutions for change, evidence of impact, and advice for continuous improvement. Sustained behaviour change sits at the centre of challenges such as climate, public health, misinformation and domestic abuse.",
      "Teams help define the behavioural problem, understand what influences it, design communications and interventions, then trial and evaluate them. The work follows Verian's DEEPER process, from defining the problem to evaluating after implementation, and campaign evaluation looks past reactions to attention, motivation and action.",
    ],
    services: [
      "Initial consultancy: theories of change, hypotheses and KPIs",
      "Behavioural insight and creative development research",
      "Intervention design and testing, including the online Behaviour Change Lab",
      "Experiments, randomised trials and return-on-investment modelling",
      "A behaviour change framework covering conscious and non-conscious influences",
      "A commitment model for change across a whole population",
    ],
  },
  {
    slug: "political-opinion-and-electoral",
    name: "Political, Opinion and Electoral",
    label: "Polling",
    short: "Political and opinion polling that informs decision-makers and raises the quality of public debate.",
    url: "https://www.veriangroup.com/expertise/political-opinion-and-electoral-advisory",
    topics: ["Political, Opinion & Electoral"],
    stages: [0],
    summary: [
      "Some of the world's largest public opinion studies, used by governments, communities, interest groups, trade unions, NGOs and companies to understand their context and where opinion is heading.",
      "Advice covers reputation and brand, media commentary from an apolitical, evidence-based position, and election research and forecasting across the whole election cycle.",
    ],
    services: [
      "Reputation and brand research, with international comparisons for public bodies",
      "Media advice, with trained spokespeople who work to the news cycle",
      "Voting intention research, campaign analysis and social media analysis",
      "Outcome projections at party and seat level",
      "Exit polls, in person and on digital platforms",
      "Live projections and analysis for election-night television",
      "Post-election analysis and reporting",
    ],
    facts: [
      "Decades of experience in local, national and pan-national elections",
      "In the UK, the agency that correctly forecast the 2016 Brexit vote",
    ],
  },
  {
    slug: "social-licence",
    name: "Social Licence",
    label: "Social licence",
    short: "Understanding, earning and keeping the public support that transitions and big projects depend on.",
    url: "https://www.veriangroup.com/expertise/social-licence",
    topics: ["Social Licence"],
    stages: [0, 2],
    summary: [
      "Social licence is the level of community acceptance, permission and support an organisation needs to operate, or to deliver a particular project. Verian adapted the idea from the private sector for government, with a validated way to measure it and principles for consulting communities.",
      "Any public body whose decisions affect communities needs one, from infrastructure, utilities and planning to health, education, emergency management and regulation. The pay-off is faster delivery, lower risk and policy designed around citizens.",
    ],
    services: [
      "Measuring the licence to operate, and support for a specific project",
      "Assessing community literacy: the organisation, the problem, the solution and its mandate",
      "A decision-logic framework with four levels, from withheld to psychological identification",
      "Qualitative and deliberative methods to diagnose and improve",
      "Indexing and benchmarking progress over time",
    ],
    facts: [
      "Three components: legitimacy, credibility and trust",
      "Two kinds of licence: to operate, and for a specific project",
      "Four levels of support, from withheld to psychological identification",
    ],
  },
  {
    slug: "data-solutions",
    name: "Data Solutions",
    label: "Data collection",
    short: "Verian's own international data collection and data management capability.",
    url: "https://www.veriangroup.com/expertise/data-solutions",
    // Verian has no "Data Solutions" tag, so related work is found by searching the library.
    topics: [],
    relatedQuery: "longitudinal survey fieldwork household panel data",
    stages: [0, 2],
    summary: [
      "Verian's own international data collection and data management capability, supplying evidence to governments, multilateral agencies and leading universities. Its data ecosystem links policymakers and citizens, measuring the values, attitudes and resources of households and individuals.",
      "Survey methodologists, statisticians, data modellers and econometricians combine classical methods with machine learning and AI-enabled approaches where they fit, across socio-economic, biomedical, deliberative and secondary data.",
    ],
    services: [
      "Behaviour Change Lab: a digital space for pre-testing communications and interventions",
      "Biomedical data collected at home, by nurses or by participants themselves",
      "Context modelling with official and open data",
      "Data Innovation Hub, Berlin",
      "Multilateral Research Hub, Brussels",
      "National statistics and longitudinal data",
      "Public Voice, a digital random probability citizen panel",
    ],
    facts: [
      "Origins in 1940s work for the UK government on wartime rationing",
      "Many millions of people engaged each year",
      "Recent mixed-mode survey research across 29 countries",
      "Data Innovation Hub launched in Berlin in 2021",
    ],
  },
];
