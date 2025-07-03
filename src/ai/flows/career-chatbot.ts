'use server';
/**
 * @fileOverview A career assistant chatbot flow.
 *
 * - careerChat - A function that handles a single turn in a conversation.
 * - CareerChatInput - The input type for the careerChat function.
 * - CareerChatOutput - The return type for the careerChat function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const CareerChatInputSchema = z.object({
  history: z.array(MessageSchema).describe("The conversation history."),
  message: z.string().describe("The user's latest message."),
});
export type CareerChatInput = z.infer<typeof CareerChatInputSchema>;

const CareerChatOutputSchema = z.object({
  response: z.string().describe("The chatbot's response."),
});
export type CareerChatOutput = z.infer<typeof CareerChatOutputSchema>;

export async function careerChat(input: CareerChatInput): Promise<CareerChatOutput> {
  return careerChatFlow(input);
}

const careerChatFlow = ai.defineFlow(
  {
    name: 'careerChatFlow',
    inputSchema: CareerChatInputSchema,
    outputSchema: CareerChatOutputSchema,
  },
  async ({ history, message }) => {
    const systemPrompt = `You are ResuMate, a friendly and expert career assistant chatbot. Your main goal is to help users create a resume from scratch by asking them questions, or to provide job role suggestions based on their skills.

Instructions:
1.  If the user wants to create a resume, first ask for a target job description.
2.  Then, guide them step-by-step to gather information: contact details, professional summary, work experience (job title, company, dates, responsibilities), education, and skills.
3.  If the user asks for job suggestions, ask about their skills and interests to provide relevant roles.
4.  Keep your responses concise, friendly, and helpful. Use markdown for lists. You MUST format your entire response as a single JSON object with a single key "response" that contains your text reply.

Conversation History:
${history.map((h) => `${h.role}: ${h.content}`).join('\n')}
user: ${message}
model:`;

    const result = await ai.generate({
      prompt: systemPrompt,
      output: {
        format: 'json',
        schema: CareerChatOutputSchema,
      },
       config: {
        safetySettings: [
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE',
          },
        ],
      },
    });

    return result.output!;
  }
);
