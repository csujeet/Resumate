'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast"
import { Separator } from "@/components/ui/separator"

import { ClipboardList, FileText, FileEdit, Wand2 } from 'lucide-react';

import { analyzeJobDescription } from '@/ai/flows/analyze-job-description';
import { suggestResumeEdits } from '@/ai/flows/suggest-resume-edits';

const formSchema = z.object({
  resumeText: z.string().min(100, { message: 'Your resume text should be at least 100 characters long.' }),
  jobDescription: z.string().min(100, { message: 'The job description should be at least 100 characters long.' }),
});

export default function Home() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      resumeText: '',
      jobDescription: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setAnalysis(null);
    setSuggestions(null);

    try {
      const analysisResult = await analyzeJobDescription({
        jobDescription: values.jobDescription,
      });
      setAnalysis(analysisResult.keywords);
      
      // Artificial delay to allow for a subtle transition as the second AI call is made
      setTimeout(async () => {
        try {
          const suggestionsResult = await suggestResumeEdits({
            resumeText: values.resumeText,
            jobDescription: values.jobDescription,
            jobDescriptionAnalysis: analysisResult.keywords,
          });
          setSuggestions(suggestionsResult.suggestedEdits);
        } catch (error) {
          console.error("Error suggesting resume edits:", error);
          toast({
            title: "Error Generating Suggestions",
            description: "Could not generate resume suggestions. Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      }, 700);

    } catch (error) {
      console.error("Error analyzing job description:", error);
      toast({
        title: "Error Analyzing Job Description",
        description: "Could not analyze the job description. Please check the input and try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }

  const renderBulletedList = (text: string) => {
    return (
      <ul className="list-disc space-y-2 pl-5">
        {text.split('\n').map((item, index) => {
          const cleanedItem = item.replace(/^[*-]\s*/, '').trim();
          if (cleanedItem) {
            return <li key={index}>{cleanedItem}</li>;
          }
          return null;
        })}
      </ul>
    );
  };

  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-primary to-accent text-transparent bg-clip-text">
          ResuMate
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Intelligently tailor your resume for any job description.
        </p>
      </header>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <FormField
              control={form.control}
              name="resumeText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-lg"><FileText className="mr-2 h-5 w-5" /> Your Resume</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Paste the full text of your resume here..."
                      className="min-h-[300px] text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="jobDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-lg"><ClipboardList className="mr-2 h-5 w-5" /> Job Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Paste the target job description here..."
                      className="min-h-[300px] text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="text-center">
            <Button type="submit" size="lg" disabled={isLoading}>
              <Wand2 className="mr-2 h-5 w-5" />
              {isLoading ? 'Analyzing...' : 'Analyze & Suggest Edits'}
            </Button>
          </div>
        </form>
      </Form>

      {(isLoading || analysis || suggestions) && (
        <div className="mt-12">
          <Separator className="my-8" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="transition-all duration-500 ease-in-out">
              <CardHeader>
                <CardTitle className="flex items-center"><ClipboardList className="mr-2 text-primary" /> Job Description Analysis</CardTitle>
                <CardDescription>Key skills, keywords, and requirements found by the AI.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm min-h-[200px]">
                {isLoading && !analysis ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-2/5" />
                  </div>
                ) : analysis ? (
                  renderBulletedList(analysis)
                ) : null}
              </CardContent>
            </Card>

            <Card className="transition-all duration-500 ease-in-out">
              <CardHeader>
                <CardTitle className="flex items-center"><FileEdit className="mr-2 text-primary" /> Resume Edit Suggestions</CardTitle>
                <CardDescription>AI-powered suggestions to tailor your resume.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm min-h-[200px]">
                {isLoading && !suggestions ? (
                   <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : suggestions ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{suggestions}</p>
                ) : (
                  analysis && !isLoading && <p className="text-muted-foreground">Suggestions will appear here...</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
