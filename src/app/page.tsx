'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import jsPDF from 'jspdf';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { ClipboardList, FileEdit, Wand2, UploadCloud, Download, Eye, FileText, ChevronDown } from 'lucide-react';

import { analyzeJobDescription } from '@/ai/flows/analyze-job-description';
import { suggestResumeEdits } from '@/ai/flows/suggest-resume-edits';
import { generateTailoredResume, type GenerateTailoredResumeOutput } from '@/ai/flows/generate-tailored-resume';

// This is needed for pdf.js-dist to work in the browser environment with Next.js
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

const formSchema = z.object({
  resumeFile: z.any().refine((file): file is File => file instanceof File, {
    message: 'Please upload your resume as a PDF, DOCX, or TXT file.',
  }),
  jobDescription: z.string().min(100, { message: 'The job description should be at least 100 characters long.' }),
});

export default function Home() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [tailoredResume, setTailoredResume] = useState<GenerateTailoredResumeOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobDescription: '',
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue('resumeFile', file, { shouldValidate: true });
      setFileName(file.name);
    }
  };
  
  const extractTextFromFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const fileType = file.type;
      
      if (fileType === 'application/pdf') {
        reader.onload = async (e) => {
          try {
            const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);
            const pdf = await pdfjs.getDocument(typedArray).promise;
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                text += textContent.items.map((item: any) => item.str).join(' ');
            }
            resolve(text);
          } catch (error) {
            console.error('PDF parsing error:', error);
            reject('Failed to parse PDF file. It might be corrupted or protected.');
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        reader.onload = async (e) => {
          try {
            const mammoth = (await import('mammoth')).default;
            const result = await mammoth.extractRawText({ arrayBuffer: e.target?.result as ArrayBuffer });
            resolve(result.value);
          } catch (error) {
            console.error('DOCX parsing error:', error);
            reject('Failed to parse DOCX file.');
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (fileType === 'text/plain') {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      } else {
        reject('Unsupported file type. Please upload a PDF, DOCX, or TXT file.');
      }
    });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setAnalysis(null);
    setSuggestions(null);
    setTailoredResume(null);

    try {
      const resumeText = await extractTextFromFile(values.resumeFile);
      if (!resumeText.trim()) {
        throw new Error("Could not extract any text from the resume file. It might be empty or an image-based file.");
      }

      // Step 1: Analyze Job Description
      const analysisResult = await analyzeJobDescription({
        jobDescription: values.jobDescription,
      });
      setAnalysis(analysisResult.keywords);

      // Step 2 & 3: Get suggestions and generate tailored resume in parallel
      const suggestionsPromise = suggestResumeEdits({
        resumeText: resumeText,
        jobDescription: values.jobDescription,
        jobDescriptionAnalysis: analysisResult.keywords,
      });

      const tailoredResumePromise = generateTailoredResume({
        resumeText: resumeText,
        jobDescription: values.jobDescription,
      });

      const [suggestionsResult, tailoredResumeResult] = await Promise.all([
        suggestionsPromise,
        tailoredResumePromise,
      ]);

      setSuggestions(suggestionsResult.suggestedEdits);
      setTailoredResume(tailoredResumeResult);

    } catch (error: any) {
      console.error("Error during resume processing:", error);
      toast({
        title: "An Error Occurred",
        description: error.message || "Could not process your request. Please check the files and try again.",
        variant: "destructive",
      });
    } finally {
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
  
  const handleDownloadDocx = async () => {
    if (!tailoredResume) return;

    const { name, email, phone, linkedin, summary, sections } = tailoredResume;

    const doc = new DocxDocument({
        sections: [{
            children: [
                new Paragraph({
                    text: name,
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    text: `${email} | ${phone}${linkedin ? ` | ${linkedin}` : ''}`,
                    alignment: AlignmentType.CENTER,
                    style: "contact",
                }),
                new Paragraph({ text: "", spacing: { after: 200 } }),
                new Paragraph({
                    text: "Summary",
                    heading: HeadingLevel.HEADING_2,
                    border: { bottom: { color: "auto", space: 1, value: "single", size: 6 } },
                    spacing: { after: 200 },
                }),
                new Paragraph({ text: summary, spacing: { after: 200 } }),
                ...sections.flatMap(section => [
                    new Paragraph({
                        text: section.title,
                        heading: HeadingLevel.HEADING_2,
                        border: { bottom: { color: "auto", space: 1, value: "single", size: 6 } },
                        spacing: { after: 200 },
                    }),
                    ...section.body.split('\n').filter(line => line.trim() !== '').map(line => {
                        const isBullet = line.trim().startsWith('- ');
                        return new Paragraph({
                            text: isBullet ? line.trim().substring(2) : line.trim(),
                            bullet: isBullet ? { level: 0 } : undefined,
                            indent: isBullet ? { left: 720 } : undefined,
                            spacing: { after: 100 },
                        });
                    }),
                    new Paragraph({ text: "" }),
                ])
            ],
        }],
        styles: {
            paragraphStyles: [{
                id: "contact",
                name: "Contact Info",
                basedOn: "Normal",
                next: "Normal",
                run: { size: 20, font: "Calibri" },
            }]
        }
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tailored-resume.docx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    if (!tailoredResume) return;

    const { name, email, phone, linkedin, summary, sections } = tailoredResume;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 60;

    const checkPageBreak = (spaceNeeded: number) => {
        if (yPos + spaceNeeded > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
        }
    };

    doc.setFontSize(24);
    doc.setFont("times", "bold");
    doc.text(name, pageWidth / 2, yPos, { align: 'center' });
    yPos += 20;

    doc.setFontSize(10);
    doc.setFont("times", "normal");
    const contactInfo = `${email} | ${phone}${linkedin ? ` | ${linkedin}` : ''}`;
    doc.text(contactInfo, pageWidth / 2, yPos, { align: 'center' });
    yPos += 30;

    const printSection = (title: string, body: string) => {
        checkPageBreak(40);
        doc.setFontSize(14);
        doc.setFont("times", "bold");
        doc.text(title.toUpperCase(), margin, yPos);
        yPos += 8;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 18;

        doc.setFontSize(11);
        doc.setFont("times", "normal");

        const lines = body.split('\n');
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('- ')) {
                const bulletText = trimmedLine.substring(2);
                const textLines = doc.splitTextToSize(bulletText, pageWidth - (margin * 2) - 20);
                checkPageBreak(textLines.length * 12);
                doc.text('\u2022', margin + 10, yPos, {});
                doc.text(textLines, margin + 25, yPos);
                yPos += (textLines.length * 12);
            } else if (trimmedLine) {
                const textLines = doc.splitTextToSize(trimmedLine, pageWidth - (margin * 2));
                checkPageBreak(textLines.length * 12);
                doc.text(textLines, margin, yPos);
                yPos += (textLines.length * 12);
            }
        });
        yPos += 12;
    };

    printSection("Summary", summary);
    
    sections.forEach(section => {
        printSection(section.title, section.body);
    });

    doc.save('tailored-resume.pdf');
  };

  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-primary to-accent text-transparent bg-clip-text">
          ResuMate
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Upload your resume, paste a job description, and get an AI-tailored version in seconds.
        </p>
      </header>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <FormField
              control={form.control}
              name="resumeFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-lg"><FileText className="mr-2 h-5 w-5" /> Your Resume</FormLabel>
                  <FormControl>
                    <div 
                      className="relative flex flex-col items-center justify-center w-full h-80 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-secondary transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                        <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                        {fileName ? (
                          <p className="font-semibold text-foreground px-2">{fileName}</p>
                        ) : (
                          <>
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT</p>
                          </>
                        )}
                      </div>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileChange}
                      />
                    </div>
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
                      className="min-h-[300px] h-80 text-base"
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
              {isLoading ? 'Analyzing...' : 'Tailor My Resume'}
            </Button>
          </div>
        </form>
      </Form>

      {(isLoading || analysis || suggestions || tailoredResume) && (
        <div className="mt-12 space-y-8">
          <Separator className="my-8" />
          
          <Card className="transition-all duration-500 ease-in-out border-primary border-2 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center"><FileEdit className="mr-2 text-primary" /> Your New Tailored Resume</CardTitle>
              <CardDescription>This is the AI-generated resume, optimized for the job description.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm min-h-[100px]">
              {isLoading && !tailoredResume ? (
                 <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : tailoredResume?.fullResumeText ? (
                <p className="whitespace-pre-wrap leading-relaxed line-clamp-4">{tailoredResume.fullResumeText}</p>
              ) : (
                <p className="text-muted-foreground">Your tailored resume will appear here...</p>
              )}
            </CardContent>
            <CardFooter className="gap-2">
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" disabled={!tailoredResume || isLoading}>
                            <Eye className="mr-2" /> Preview
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                        <DialogTitle>Tailored Resume Preview</DialogTitle>
                        <DialogDescription>
                            Review the full text of your new resume. You can copy it from here.
                        </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[60vh] rounded-md border p-4">
                            <pre className="text-sm whitespace-pre-wrap font-sans">{tailoredResume?.fullResumeText}</pre>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button disabled={!tailoredResume || isLoading}>
                            <Download className="mr-2" /> Download <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={handleDownloadDocx}>Download as DOCX</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadPdf}>Download as PDF</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardFooter>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="transition-all duration-500 ease-in-out">
              <CardHeader>
                <CardTitle className="flex items-center"><ClipboardList className="mr-2 text-primary" /> Job Description Analysis</CardTitle>
                <CardDescription>Key skills and keywords found by the AI.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm min-h-[200px]">
                {isLoading && !analysis ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                ) : analysis ? (
                  renderBulletedList(analysis)
                ) : null}
              </CardContent>
            </Card>

            <Card className="transition-all duration-500 ease-in-out">
              <CardHeader>
                <CardTitle className="flex items-center"><FileEdit className="mr-2 text-primary" /> Resume Edit Suggestions</CardTitle>
                <CardDescription>AI-powered suggestions to improve your resume.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm min-h-[200px]">
                {isLoading && !suggestions ? (
                   <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                ) : suggestions ? (
                  renderBulletedList(suggestions)
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
