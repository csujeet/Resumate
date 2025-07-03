'use server';
/**
 * @fileOverview Flow to generate a cover letter.
 *
 * - generateCoverLetter - A function that creates a cover letter based on a resume and job description.
 * - GenerateCoverLetterInput - The input type for the function.
 * - GenerateCoverLetterOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateCoverLetterInputSchema = z.object({
  candidateName: z.string().describe("The full name of the candidate."),
  resumeText: z.string().describe('The original text content of the resume.'),
  jobDescription: z
    .string()
    .describe('The target job description text.'),
});
export type GenerateCoverLetterInput = z.infer<typeof GenerateCoverLetterInputSchema>;

const GenerateCoverLetterOutputSchema = z.object({
  coverLetter: z.string().describe("The generated cover letter text, formatted professionally with paragraphs."),
});
export type GenerateCoverLetterOutput = z.infer<typeof GenerateCoverLetterOutputSchema>;


export async function generateCoverLetter(
  input: GenerateCoverLetterInput
): Promise<GenerateCoverLetterOutput> {
  return generateCoverLetterFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCoverLetterPrompt',
  input: {schema: GenerateCoverLetterInputSchema},
  output: {schema: GenerateCoverLetterOutputSchema},
  prompt: `You are a professional career coach and expert cover letter writer. Your task is to write a compelling and professional cover letter for {{{candidateName}}} based on their resume and the target job description.

**Instructions:**
1.  **Analyze Documents:** Thoroughly review the provided resume and the job description.
2.  **Structure:** Format the cover letter with a clear introduction, body, and conclusion. Use professional and engaging language.
3.  **Introduction:** Start by expressing enthusiasm for the role and the company. Mention the specific job title.
4.  **Body Paragraphs:** In 2-3 paragraphs, connect the candidate's experience and skills from their resume directly to the key requirements listed in the job description. Use specific examples and quantify achievements where possible.
5.  **Conclusion:** Reiterate interest in the position and include a strong call to action, suggesting a discussion about how they can contribute to the company.
6.  **Tone:** Maintain a professional, confident, and enthusiastic tone throughout the letter.

**Candidate Name:**
{{{candidateName}}}

**Original Resume:**
{{{resumeText}}}

**Target Job Description:**
{{{jobDescription}}}
`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
    ],
  },
});

const generateCoverLetterFlow = ai.defineFlow(
  {
    name: 'generateCoverLetterFlow',
    inputSchema: GenerateCoverLetterInputSchema,
    outputSchema: GenerateCoverLetterOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
