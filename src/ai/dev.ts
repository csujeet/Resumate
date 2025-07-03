import { config } from 'dotenv';
config();

import '@/ai/flows/analyze-job-description.ts';
import '@/ai/flows/suggest-resume-edits.ts';
import '@/ai/flows/generate-tailored-resume.ts';
import '@/ai/flows/career-chatbot.ts';
