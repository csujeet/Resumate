'use server';

/**
 * @fileOverview Analyzes a job description to identify key skills, keywords, and requirements.
 *
 * - analyzeJobDescription - A function that handles the job description analysis.
 * - AnalyzeJobDescriptionInput - The input type for the analyzeJobDescription function.
 * - AnalyzeJobDescriptionOutput - The return type for the analyzeJobDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeJobDescriptionInputSchema = z.object({
  jobDescription: z
    .string()
    .describe('The job description text to be analyzed.'),
});
export type AnalyzeJobDescriptionInput = z.infer<typeof AnalyzeJobDescriptionInputSchema>;

const AnalyzeJobDescriptionOutputSchema = z.object({
  keywords: z
    .string()
    .describe(
      'A bulleted list of key skills, keywords, and requirements extracted from the job description.'
    ),
});
export type AnalyzeJobDescriptionOutput = z.infer<typeof AnalyzeJobDescriptionOutputSchema>;

export async function analyzeJobDescription(
  input: AnalyzeJobDescriptionInput
): Promise<AnalyzeJobDescriptionOutput> {
  return analyzeJobDescriptionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeJobDescriptionPrompt',
  input: {schema: AnalyzeJobDescriptionInputSchema},
  output: {schema: AnalyzeJobDescriptionOutputSchema},
  prompt: `You are an expert career coach. Analyze the job description provided and extract the key skills, keywords, and requirements. Present the result as a bulleted list.

Job Description:
{{{jobDescription}}}`,
});

const analyzeJobDescriptionFlow = ai.defineFlow(
  {
    name: 'analyzeJobDescriptionFlow',
    inputSchema: AnalyzeJobDescriptionInputSchema,
    outputSchema: AnalyzeJobDescriptionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
