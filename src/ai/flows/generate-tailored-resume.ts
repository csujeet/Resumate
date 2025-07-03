'use server';
/**
 * @fileOverview Flow to generate a complete, tailored resume.
 *
 * - generateTailoredResume - A function that rewrites a resume to align with a job description.
 * - GenerateTailoredResumeInput - The input type for the function.
 * - GenerateTailoredResumeOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateTailoredResumeInputSchema = z.object({
  resumeText: z.string().describe('The original text content of the resume.'),
  jobDescription: z
    .string()
    .describe('The target job description text.'),
});
export type GenerateTailoredResumeInput = z.infer<typeof GenerateTailoredResumeInputSchema>;

const WorkExperienceItemSchema = z.object({
  jobTitle: z.string().describe("The job title."),
  company: z.string().describe("The company name."),
  location: z.string().describe("The location of the job."),
  dates: z.string().describe("The start and end dates of employment."),
  description: z.array(z.string()).describe("A list of achievements or responsibilities, where each string is a bullet point."),
});

const EducationItemSchema = z.object({
  degree: z.string().describe("The degree or certificate obtained."),
  school: z.string().describe("The name of the school or university."),
  location: z.string().optional().describe("The location of the school."),
  dates: z.string().optional().describe("The dates of attendance or graduation date."),
  details: z.array(z.string()).optional().describe("A list of additional details like honors or GPA, where each string is a bullet point."),
});

const GenericSectionSchema = z.object({
  title: z.string(),
  body: z.string().describe("The content of the section as a single block of text. Can contain markdown for lists."),
});

const GenerateTailoredResumeOutputSchema = z.object({
  name: z.string().describe("The full name of the candidate."),
  candidateTitle: z.string().describe("The candidate's professional title, to be displayed under their name (e.g., 'Creative Director')."),
  email: z.string().describe("The candidate's email address."),
  phone: z.string().describe("The candidate's phone number."),
  linkedin: z.string().optional().describe("A link to the candidate's LinkedIn profile."),
  address: z.string().optional().describe("The candidate's city, state, and zip code."),
  summary: z.object({
      title: z.string().describe("The title for the summary section (e.g., 'Career Objective', 'Professional Summary')."),
      body: z.string().describe("The summary content as a paragraph."),
  }),
  workExperience: z.array(WorkExperienceItemSchema).describe("A list of all work experience entries, ordered from most to least recent."),
  education: z.array(EducationItemSchema).describe("A list of all education entries."),
  otherSections: z.array(GenericSectionSchema).optional().describe("Any other sections from the resume, such as 'Skills' or 'Projects'."),
  fullResumeText: z
    .string()
    .describe('The full, rewritten resume, tailored for the job description, as a single block of well-formatted text. This is a fallback and for previewing.'),
});
export type GenerateTailoredResumeOutput = z.infer<typeof GenerateTailoredResumeOutputSchema>;


export async function generateTailoredResume(
  input: GenerateTailoredResumeInput
): Promise<GenerateTailoredResumeOutput> {
  return generateTailoredResumeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateTailoredResumePrompt',
  input: {schema: GenerateTailoredResumeInputSchema},
  output: {schema: GenerateTailoredResumeOutputSchema},
  prompt: `You are an expert resume writer specializing in optimizing resumes for Applicant Tracking Systems (ATS). Your task is to parse the provided resume, rewrite it to be perfectly tailored for the given job description, and return it in a structured JSON format.

- **Analyze both documents:** Carefully analyze the original resume and the job description.
- **ATS Keyword Optimization:** Your primary goal is to maximize the resume's score by mirroring the exact keywords and phrases from the job description. Integrate them naturally into the summary and experience sections.
- **Quantify Achievements:** Rephrase bullet points to include numbers and metrics where possible to show impact (e.g., "Increased efficiency by 15%").
- **Clean Formatting:** Ensure the output format is clean and simple. Avoid any special characters, tables, or columns that could confuse an ATS.

You MUST return a structured JSON object that strictly adheres to the provided output schema.
- **Header**: Extract the candidate's full name, professional title (e.g., "Creative Director"), email, phone, LinkedIn URL, and address.
- **Summary/Objective**: Identify the summary section, its title (e.g., "Career Objective"), and its content.
- **Work Experience**: For each job, extract the job title, company, location, dates, and a list of responsibilities/achievements.
- **Education**: For each degree, extract the degree name, school, location, dates, and any additional details like honors.
- **Other Sections**: Capture any remaining sections like "Skills" under the 'otherSections' array.
- **Full Text**: Also return the complete, edited resume as a single block of well-formatted text in the 'fullResumeText' field. This should be a clean text version of all the structured data combined.

Original Resume:
{{{resumeText}}}

Target Job Description:
{{{jobDescription}}}
`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
    ],
  },
});

const generateTailoredResumeFlow = ai.defineFlow(
  {
    name: 'generateTailoredResumeFlow',
    inputSchema: GenerateTailoredResumeInputSchema,
    outputSchema: GenerateTailoredResumeOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
