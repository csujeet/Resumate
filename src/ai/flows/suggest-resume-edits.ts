'use server';
/**
 * @fileOverview Resume edit suggestion flow.
 *
 * - suggestResumeEdits - A function that suggests resume edits based on job description analysis.
 * - SuggestResumeEditsInput - The input type for the suggestResumeEdits function.
 * - SuggestResumeEditsOutput - The return type for the suggestResumeEdits function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestResumeEditsInputSchema = z.object({
  resumeText: z.string().describe('The text content of the resume.'),
  jobDescription: z.string().describe('The job description text to tailor the resume to.'),
  jobDescriptionAnalysis: z.string().describe('The analysis of the job description, including keywords and skills.'),
});
export type SuggestResumeEditsInput = z.infer<typeof SuggestResumeEditsInputSchema>;

const SuggestResumeEditsOutputSchema = z.object({
  suggestedEdits: z.string().describe('Specific suggestions for editing the resume to match the job description.'),
});
export type SuggestResumeEditsOutput = z.infer<typeof SuggestResumeEditsOutputSchema>;

export async function suggestResumeEdits(input: SuggestResumeEditsInput): Promise<SuggestResumeEditsOutput> {
  return suggestResumeEditsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestResumeEditsPrompt',
  input: {schema: SuggestResumeEditsInputSchema},
  output: {schema: SuggestResumeEditsOutputSchema},
  prompt: `You are an expert resume editor. Given a resume and a job description analysis, provide specific suggestions for editing the resume to better match the job description.

Resume:
{{resumeText}}

Job Description Analysis:
{{jobDescriptionAnalysis}}

Suggestions:
`,config: {
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

const suggestResumeEditsFlow = ai.defineFlow(
  {
    name: 'suggestResumeEditsFlow',
    inputSchema: SuggestResumeEditsInputSchema,
    outputSchema: SuggestResumeEditsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
