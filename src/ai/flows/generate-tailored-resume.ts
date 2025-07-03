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

const ResumeSectionSchema = z.object({
    title: z.string().describe("The title of the resume section (e.g., 'Work Experience', 'Education', 'Skills')."),
    body: z.string().describe("The content of the section. Use markdown for bullet points (e.g., '- Led a team...'). Newlines will be preserved."),
});

const GenerateTailoredResumeOutputSchema = z.object({
  name: z.string().describe("The full name of the candidate."),
  email: z.string().describe("The candidate's email address."),
  phone: z.string().describe("The candidate's phone number."),
  linkedin: z.string().optional().describe("A link to the candidate's LinkedIn profile."),
  summary: z.string().describe("A professional summary or objective statement, 2-4 sentences long."),
  sections: z.array(ResumeSectionSchema).describe("An array of resume sections, like Experience, Education, and Skills."),
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
  prompt: `You are an expert career coach and resume writer. Your task is to rewrite the provided resume to be perfectly tailored for the given job description.

- **Analyze both documents:** Carefully analyze the original resume and the job description.
- **Incorporate Keywords:** Integrate relevant keywords and skills from the job description into the resume naturally.
- **Highlight Relevant Experience:** Rephrase and reorder bullet points to emphasize the most relevant experience and accomplishments for the target role.
- **Maintain Professional Tone:** Ensure the tone is professional and the formatting is clean and readable.
- **Return Structured Data and Full Text:** You must return both a structured JSON object with the resume broken down into logical parts (name, contact, summary, sections) AND the complete, edited resume as a single block of text in the 'fullResumeText' field.

When creating the structured data:
- For the 'body' of each section, use markdown for bullet points (e.g., start lines with '- ').
- Preserve newlines in the section bodies.

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
