"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CvDropzone } from "@/components/features/cv-dropzone";
import { Logo } from "@/components/layout/logo";
import { ErrorState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { StageThread } from "@/components/shared/stage-thread";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { applySchema, checkSupportingDocument, MAX_DOCUMENTS } from "@/lib/schemas";
import type { PublicJob } from "@/lib/types";

type ApplyValues = z.infer<typeof applySchema>;

// The public application page. Candidates do not need an account.
export default function ApplyPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [cv, setCv] = useState<File | null>(null);
  const [cvError, setCvError] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const [documentsError, setDocumentsError] = useState("");
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);

  const job = useQuery({
    queryKey: ["public-job", jobId],
    queryFn: () => api.get<PublicJob>(`/public/jobs/${jobId}`, false),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplyValues>({ resolver: zodResolver(applySchema) });

  async function onSubmit(values: ApplyValues) {
    setServerError("");
    if (!cv) {
      setCvError("Attach your CV");
      return;
    }
    setCvError("");
    if (documents.length > MAX_DOCUMENTS) {
      setDocumentsError(`Upload no more than ${MAX_DOCUMENTS} supporting documents`);
      return;
    }
    const form = new FormData();
    form.append("full_name", values.full_name);
    form.append("email", values.email);
    form.append("phone", values.phone);
    form.append("candidate_qualifications", values.candidate_qualifications);
    if (values.expected_salary) form.append("expected_salary", values.expected_salary);
    if (values.cover_letter) form.append("cover_letter", values.cover_letter);
    form.append("cv", cv);
    documents.forEach((document) => form.append("supporting_documents", document));
    try {
      await api.postForm(`/public/jobs/${jobId}/applications`, form);
      setDone(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not send your application");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
          <Logo href="#" />
          {job.data && <span className="text-sm font-semibold text-muted-foreground">{job.data.company_name}</span>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        {job.isLoading && <Skeleton className="h-64" />}
        {job.isError && <ErrorState message="This job is not accepting applications." />}

        {job.data && (
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <section>
              <p className="text-sm font-semibold text-primary">{job.data.company_name} is hiring</p>
              <h1 className="mt-1 text-4xl font-bold leading-tight sm:text-5xl">{job.data.title}</h1>
              <div className="mt-8 rounded-lg border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-muted-foreground">What happens after you apply</h2>
                <StageThread stage="applied" />
              </div>
              <h2 className="mb-2 mt-8 text-xl font-semibold">About the role</h2>
              <p className="max-w-prose whitespace-pre-line leading-relaxed text-foreground/80">{job.data.description}</p>
              {job.data.qualification_requirements && (
                <>
                  <h2 className="mb-2 mt-8 text-xl font-semibold">What you&apos;ll bring</h2>
                  <p className="max-w-prose whitespace-pre-line leading-relaxed text-foreground/80">{job.data.qualification_requirements}</p>
                </>
              )}
              {(job.data.salary_min !== null || job.data.salary_max !== null) && (
                <p className="mt-5 text-sm font-semibold text-muted-foreground">
                  Salary range: {job.data.salary_min?.toLocaleString() ?? "Not stated"} – {job.data.salary_max?.toLocaleString() ?? "Not stated"}
                </p>
              )}
            </section>

            <section>
              <Card className="lg:sticky lg:top-6">
                {done ? (
                  <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <CheckCircle2 className="size-12 text-stage-hired" />
                    <h2 className="text-2xl font-bold">Application sent</h2>
                    <p className="text-muted-foreground">
                      Thanks for applying to {job.data.company_name}. We emailed you a confirmation.
                    </p>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader>
                      <CardTitle className="text-2xl">Apply for this role</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
                        <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
                          <Input id="full_name" autoComplete="name" {...register("full_name")} />
                        </Field>
                        <Field label="Email" htmlFor="email" error={errors.email?.message}>
                          <Input id="email" type="email" autoComplete="email" {...register("email")} />
                        </Field>
                        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
                          <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
                        </Field>
                        <Field label="Relevant qualifications and experience" htmlFor="candidate_qualifications" error={errors.candidate_qualifications?.message}>
                          <Textarea id="candidate_qualifications" rows={4} {...register("candidate_qualifications")} />
                        </Field>
                        <Field label="Expected salary (optional)" htmlFor="expected_salary" error={errors.expected_salary?.message}>
                          <Input id="expected_salary" type="number" min="0" {...register("expected_salary")} />
                        </Field>
                        <Field label="CV" htmlFor="cv">
                          <CvDropzone file={cv} onChange={setCv} error={cvError} />
                        </Field>
                        <Field label="Supporting documents (up to 6)" htmlFor="supporting_documents" error={documentsError}>
                          <Input
                            id="supporting_documents"
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                            onChange={(event) => {
                              const next = Array.from(event.target.files ?? []);
                              if (next.length > MAX_DOCUMENTS) {
                                setDocumentsError(`Upload no more than ${MAX_DOCUMENTS} supporting documents`);
                                setDocuments([]);
                                return;
                              }
                              const invalid = next.map(checkSupportingDocument).find(Boolean);
                              setDocumentsError(invalid ?? "");
                              setDocuments(invalid ? [] : next);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, PNG or JPG. Up to 10 MB each.</p>
                          {documents.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-2">
                              {documents.map((document, index) => (
                                <li key={`${document.name}-${document.lastModified}`} className="flex items-center gap-2 text-sm">
                                  <FileText className="size-4 text-muted-foreground" />
                                  <span className="min-w-0 flex-1 truncate">{document.name}</span>
                                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${document.name}`} onClick={() => setDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                                    <X />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Field>
                        <Field label="Cover letter (optional)" htmlFor="cover_letter" error={errors.cover_letter?.message}>
                          <Textarea id="cover_letter" {...register("cover_letter")} />
                        </Field>
                        {serverError && (
                          <p role="alert" className="text-sm font-medium text-destructive">
                            {serverError}
                          </p>
                        )}
                        <Button type="submit" size="lg" disabled={isSubmitting}>
                          {isSubmitting ? "Sending..." : "Send application"}
                        </Button>
                      </form>
                    </CardContent>
                  </>
                )}
              </Card>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
