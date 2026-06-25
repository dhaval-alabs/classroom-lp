// Central content config for the landing page. Edit copy/offers here.

export const COURSES = [
  "Data Science & Generative AI",
  "Data Analytics with AI",
  "Full Stack AI Engineering",
  "Business Analytics",
] as const;

export const CITIES = ["Gurgaon", "Noida", "Bangalore", "Online (Live)"] as const;

export const BACKGROUNDS = ["Student / Fresher", "Working Professional"] as const;

export const stats = [
  { value: "21,000+", label: "Careers transformed" },
  { value: "97%", label: "Placement assistance" },
  { value: "200%", label: "Avg. salary hike" },
  { value: "9.2/10", label: "Learner rating" },
];

export const programs = [
  {
    name: "Data Science & Generative AI",
    duration: "6–8 months",
    hours: "546+ hrs",
    blurb:
      "Python, ML, Deep Learning, NLP and hands-on Generative & Agentic AI. India's most in-demand classroom track.",
    tags: ["Python", "Machine Learning", "GenAI", "LLMs"],
    popular: true,
  },
  {
    name: "Data Analytics with AI",
    duration: "6–8 months",
    hours: "594+ hrs",
    blurb:
      "SQL, Excel, Power BI/Tableau, statistics and AI-assisted analytics for business decision-making roles.",
    tags: ["SQL", "Power BI", "Statistics", "AI tools"],
    popular: false,
  },
  {
    name: "Full Stack AI Engineering",
    duration: "4 months",
    hours: "317+ hrs",
    blurb:
      "Fast-track program covering applied ML, model deployment and building production AI applications.",
    tags: ["MLOps", "Deployment", "APIs", "Cloud"],
    popular: false,
  },
] as const;

export const whyClassroom = [
  {
    title: "Live in-person mentorship",
    desc: "Learn face-to-face from industry practitioners with instant doubt resolution — not pre-recorded videos.",
  },
  {
    title: "Peer cohort & networking",
    desc: "Study alongside a serious batch of career-switchers and build a network that lasts beyond the course.",
  },
  {
    title: "Hands-on capstone projects",
    desc: "Work on 14+ real datasets and a portfolio of projects reviewed live by mentors.",
  },
  {
    title: "Dedicated placement support",
    desc: "Resume building, mock interviews and direct referrals to 500+ hiring partners until you're placed.",
  },
];

export const curriculum = [
  "Python & Statistics foundations",
  "SQL & data wrangling",
  "Machine Learning & model building",
  "Deep Learning & Neural Networks",
  "NLP & Computer Vision",
  "Generative AI, LLMs & Agentic AI",
  "Power BI / Tableau dashboards",
  "Cloud deployment & MLOps",
  "Capstone & portfolio projects",
];

// Logos live in /public/brand/companies/<slug>.svg (monochrome white).
export const hiringPartners: { name: string; slug: string }[] = [
  { name: "Google", slug: "google" },
  { name: "Meta", slug: "meta" },
  { name: "Accenture", slug: "accenture" },
  { name: "TCS", slug: "tcs" },
  { name: "Infosys", slug: "infosys" },
  { name: "Wipro", slug: "wipro" },
  { name: "HCL", slug: "hcl" },
  { name: "American Express", slug: "americanexpress" },
  { name: "Goldman Sachs", slug: "goldmansachs" },
  { name: "HSBC", slug: "hsbc" },
  { name: "SAP", slug: "sap" },
  { name: "Cisco", slug: "cisco" },
  { name: "NVIDIA", slug: "nvidia" },
  { name: "Samsung", slug: "samsung" },
  { name: "Uber", slug: "uber" },
  { name: "Paytm", slug: "paytm" },
];

export const testimonials = [
  {
    name: "Rahul Mehta",
    role: "Data Scientist @ Fractal",
    quote:
      "The classroom batch kept me accountable. Mentors pushed me through tough ML concepts and the placement team got me 3 interviews in two weeks.",
    hike: "140% hike",
    bg: "Non-tech → Data Science",
  },
  {
    name: "Sneha Iyer",
    role: "Business Analyst @ Deloitte",
    quote:
      "Coming from a commerce background I was nervous, but the in-person sessions and doubt-clearing made everything click. Best career decision.",
    hike: "Fresher placement",
    bg: "Fresher",
  },
  {
    name: "Amit Verma",
    role: "Sr. Analytics Lead @ Genpact",
    quote:
      "I'd tried online courses before and never finished. The offline cohort and live projects are what finally got me job-ready.",
    hike: "95% hike",
    bg: "Working professional",
  },
];

export const faqs = [
  {
    q: "Where are the offline batches held?",
    a: "We run in-person classroom batches at our Gurgaon, Noida and Bangalore centres. A live-online option is also available if you can't attend in person.",
  },
  {
    q: "Do I need a technical background?",
    a: "No. Our classroom programs start from the fundamentals. We have successfully trained learners from commerce, mechanical, BPO and other non-tech backgrounds.",
  },
  {
    q: "What about placements?",
    a: "Every learner gets dedicated placement support — resume prep, mock interviews and referrals to 500+ hiring partners — with 97% placement assistance.",
  },
  {
    q: "Are there EMI / financing options?",
    a: "Yes. Easy no-cost EMI options are available. Our counsellor will walk you through the plans on your callback.",
  },
  {
    q: "What are the upcoming batch dates?",
    a: "New weekend and weekday classroom batches start every few weeks and seats fill fast. Register and our team will share the exact dates for your city.",
  },
];
