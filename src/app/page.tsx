'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as pdfjs from 'pdfjs-dist';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { ClipboardList, FileEdit, Wand2, UploadCloud, Download, Eye, FileText, ChevronDown, MessageSquare, Mail, Loader2 } from 'lucide-react';

import { analyzeJobDescription } from '@/ai/flows/analyze-job-description';
import { suggestResumeEdits } from '@/ai/flows/suggest-resume-edits';
import { generateTailoredResume, type GenerateTailoredResumeOutput } from '@/ai/flows/generate-tailored-resume';
import { generateCoverLetter } from '@/ai/flows/generate-cover-letter';

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
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [isCoverLetterDialogOpen, setIsCoverLetterDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
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
    setCoverLetter(null);

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

  const handleGenerateCoverLetter = async () => {
    if (!tailoredResume || !form.getValues('jobDescription') || !form.getValues('resumeFile')) return;
    setIsGeneratingCoverLetter(true);
    setCoverLetter(null);
    try {
        const resumeText = await extractTextFromFile(form.getValues('resumeFile'));
        const result = await generateCoverLetter({
            candidateName: tailoredResume.name,
            resumeText: resumeText,
            jobDescription: form.getValues('jobDescription'),
        });
        setCoverLetter(result.coverLetter);
        setIsCoverLetterDialogOpen(true);
    } catch (error: any) {
        console.error("Error generating cover letter:", error);
        toast({
            title: "Cover Letter Error",
            description: "Could not generate the cover letter. Please try again.",
            variant: "destructive",
        });
    } finally {
        setIsGeneratingCoverLetter(false);
    }
  };

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

    const { name, candidateTitle, email, phone, linkedin, address, summary, workExperience, education, otherSections } = tailoredResume;
    
    const docChildren: Paragraph[] = [];

    // Header
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: name.toUpperCase(), bold: true, size: 48 })], // 24pt
      alignment: AlignmentType.LEFT,
      spacing: { after: 0 },
    }));

    if (candidateTitle) {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: candidateTitle.toUpperCase(), size: 22, color: "595959", characterSpacing: 2 * 20 })], // 11pt, gray, letter spacing
        alignment: AlignmentType.LEFT,
        spacing: { after: 120 }, // 6pt
      }));
    }

    const contactInfo = [phone, email, linkedin, address].filter(Boolean).join(' / ');
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: contactInfo, size: 20 })], // 10pt
      alignment: AlignmentType.LEFT,
      spacing: { after: 240 }, // 12pt
    }));

    const createSection = (title: string) => {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22, color: "595959", characterSpacing: 2 * 20 })],
        spacing: { after: 120, before: 120 },
        border: { bottom: { color: "auto", space: 1, value: "single", size: 4 } },
      }));
      docChildren.push(new Paragraph({ text: "", spacing: { after: 80 }})); // Spacer after title line
    };

    // Summary Section
    if (summary?.body) {
      createSection(summary.title);
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: summary.body, size: 20 })],
      }));
    }

    // Work Experience
    if (workExperience?.length > 0) {
      createSection("Work Experience");
      workExperience.forEach(job => {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: `${job.jobTitle} / ${job.company}`, bold: true, size: 22 })],
          spacing: { before: 120 },
        }));
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: `${job.dates} / ${job.location}`, italics: true, size: 20 })],
          spacing: { after: 60 },
        }));
        job.description.forEach(desc => {
          docChildren.push(new Paragraph({
            text: desc,
            bullet: { level: 0 },
            indent: { left: 720, hanging: 360 },
            spacing: { after: 60 },
          }));
        });
      });
    }

    // Education
    if (education?.length > 0) {
      createSection("Education");
      education.forEach(edu => {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: edu.degree, bold: true, size: 22 })],
          spacing: { before: 120 },
        }));
        const eduDetails = [edu.dates, edu.school, edu.location].filter(Boolean).join(' / ');
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: eduDetails, size: 20 })],
          spacing: { after: 60 },
        }));
        edu.details?.forEach(detail => {
          docChildren.push(new Paragraph({
            text: detail,
            bullet: { level: 0 },
            indent: { left: 720, hanging: 360 },
            spacing: { after: 60 },
          }));
        });
      });
    }
    
    // Other Sections
    otherSections?.forEach(section => {
        createSection(section.title);
        section.body.split('\n').forEach(line => {
            docChildren.push(new Paragraph({
                text: line.replace(/^- /, ''),
                bullet: line.startsWith('- ') ? { level: 0 } : undefined,
                indent: line.startsWith('- ') ? { left: 720, hanging: 360 } : undefined,
                spacing: { after: 60 },
            }));
        });
    });

    const doc = new DocxDocument({ 
        sections: [{ children: docChildren }],
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

    const { name, candidateTitle, email, phone, linkedin, address, summary, workExperience, education, otherSections } = tailoredResume;
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 40;
    const lineSpacing = 1.2;
    const sectionSpacing = 20;
    
    const checkPageBreak = (spaceNeeded: number) => {
        if (yPos + spaceNeeded > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            yPos = margin;
        }
    };

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(name.toUpperCase(), margin, yPos);
    yPos += 24;

    if (candidateTitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(89, 89, 89);
      doc.text(candidateTitle.toUpperCase(), margin, yPos, { charSpace: 2 });
      yPos += 20;
    }

    const contactInfo = [phone, email, linkedin, address].filter(Boolean).join(' / ');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(contactInfo, margin, yPos);
    yPos += sectionSpacing;

    const printSectionTitle = (title: string) => {
        checkPageBreak(30);
        yPos += sectionSpacing / 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(89, 89, 89);
        doc.text(title.toUpperCase(), margin, yPos, { charSpace: 2 });
        yPos += 8;
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 15;
    };
    
    // Summary
    if (summary?.body) {
        printSectionTitle(summary.title);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        const summaryLines = doc.splitTextToSize(summary.body, pageWidth - margin * 2);
        checkPageBreak(summaryLines.length * 10 * lineSpacing);
        doc.text(summaryLines, margin, yPos);
        yPos += summaryLines.length * 10 * lineSpacing;
    }

    // Work Experience
    if (workExperience?.length > 0) {
        printSectionTitle("Work Experience");
        workExperience.forEach(job => {
            checkPageBreak(60);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(`${job.jobTitle} / ${job.company}`, margin, yPos);
            yPos += 12;

            doc.setFont('helvetica', 'italic');
            doc.setFontSize(10);
            doc.text(`${job.dates} / ${job.location}`, margin, yPos);
            yPos += 15;

            doc.setFont('helvetica', 'normal');
            job.description.forEach(desc => {
                const bulletPoint = `• ${desc}`;
                const bulletLines = doc.splitTextToSize(bulletPoint, pageWidth - margin * 2 - 15);
                checkPageBreak(bulletLines.length * 10 * lineSpacing);
                doc.text(bulletLines, margin + 5, yPos);
                yPos += (bulletLines.length * 10 * lineSpacing) + 2;
            });
            yPos += 10;
        });
    }

    // Education
    if (education?.length > 0) {
        printSectionTitle("Education");
        education.forEach(edu => {
            checkPageBreak(40);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(edu.degree, margin, yPos);
            yPos += 12;
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const eduDetails = [edu.dates, edu.school, edu.location].filter(Boolean).join(' / ');
            doc.text(eduDetails, margin, yPos);
            yPos += 15;
            
            edu.details?.forEach(detail => {
                const bulletPoint = `• ${detail}`;
                const bulletLines = doc.splitTextToSize(bulletPoint, pageWidth - margin * 2 - 15);
                checkPageBreak(bulletLines.length * 10 * lineSpacing);
                doc.text(bulletLines, margin + 5, yPos);
                yPos += (bulletLines.length * 10 * lineSpacing) + 2;
            });
             yPos += 10;
        });
    }

    // Other Sections
    otherSections?.forEach(section => {
        printSectionTitle(section.title);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        section.body.split('\n').forEach(line => {
            const isBullet = line.startsWith('- ');
            const text = isBullet ? `• ${line.substring(2)}` : line;
            const indent = isBullet ? 5 : 0;
            const textLines = doc.splitTextToSize(text, pageWidth - margin * 2 - indent);
            checkPageBreak(textLines.length * 10 * lineSpacing);
            doc.text(textLines, margin + indent, yPos);
            yPos += (textLines.length * 10 * lineSpacing) + 2;
        });
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
          Your personal AI-powered career assistant.
        </p>
      </header>
      
      <Card className="mb-8 text-center">
        <CardHeader>
          <CardTitle className="flex items-center justify-center"><MessageSquare className="mr-2 h-6 w-6" /> Create a Resume from Scratch</CardTitle>
          <CardDescription>Don't have a resume? Let our AI chatbot guide you through creating one.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/chatbot" passHref>
            <Button variant="outline">
              Start with Chatbot
            </Button>
          </Link>
        </CardFooter>
      </Card>

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold">Or, Tailor Your Existing Resume</h2>
        <p className="text-muted-foreground mt-1">Upload your resume and a job description to get an ATS-optimized version.</p>
      </div>

      <Card>
        <CardContent className="p-6">
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
        </CardContent>
      </Card>

      {(isLoading || analysis || suggestions || tailoredResume) && (
        <div className="mt-12 space-y-8">
          <Separator className="my-8" />
          
          <Card className="transition-all duration-500 ease-in-out border-primary border-2 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center"><FileEdit className="mr-2 text-primary" /> Your New Tailored Resume</CardTitle>
              <CardDescription>This is the AI-generated resume, optimized for the job description and ATS.</CardDescription>
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
            <CardFooter className="flex-wrap gap-2">
                <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" disabled={!tailoredResume || isLoading}>
                            <Eye className="mr-2" /> Preview Resume
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
                        <DialogFooter>
                            <Button onClick={() => setIsPreviewDialogOpen(false)}>Close</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button disabled={!tailoredResume || isLoading}>
                            <Download className="mr-2" /> Download Resume <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={handleDownloadDocx}>Download as DOCX</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadPdf}>Download as PDF</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                 <Button onClick={handleGenerateCoverLetter} disabled={!tailoredResume || isLoading || isGeneratingCoverLetter} variant="outline">
                    {isGeneratingCoverLetter ? <Loader2 className="mr-2 animate-spin" /> : <Mail className="mr-2" />}
                    {isGeneratingCoverLetter ? 'Generating...' : 'Generate Cover Letter'}
                </Button>
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

      <Dialog open={isCoverLetterDialogOpen} onOpenChange={setIsCoverLetterDialogOpen}>
          <DialogContent className="max-w-3xl">
              <DialogHeader>
              <DialogTitle>Your AI-Generated Cover Letter</DialogTitle>
              <DialogDescription>
                  Review your new cover letter below. You can copy the text.
              </DialogDescription>
              </DialogHeader>
              <ScrollArea className="h-[60vh] rounded-md border p-4">
                  <pre className="text-sm whitespace-pre-wrap font-sans">{coverLetter}</pre>
              </ScrollArea>
              <DialogFooter>
                  <Button onClick={() => setIsCoverLetterDialogOpen(false)}>Close</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </main>
  );
}
