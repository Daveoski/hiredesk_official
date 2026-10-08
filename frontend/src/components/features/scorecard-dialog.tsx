"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { useSubmitScorecard } from "@/lib/queries";
import { scorecardSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type ScorecardValues = z.infer<typeof scorecardSchema>;

const STARTER_CRITERIA = ["Role skills", "Communication", "Problem solving"];

export function ScorecardDialog({
  interviewId,
  candidateName,
  open,
  onOpenChange,
}: {
  interviewId: string;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Scorecard for {candidateName}</DialogTitle>
          <DialogDescription>Rate each criterion from 1 to 5. Once submitted, a scorecard cannot be changed.</DialogDescription>
        </DialogHeader>
        {open && <ScorecardForm interviewId={interviewId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ScorecardForm({ interviewId, onDone }: { interviewId: string; onDone: () => void }) {
  const submit = useSubmitScorecard();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ScorecardValues>({
    resolver: zodResolver(scorecardSchema),
    defaultValues: { recommendation: "maybe", ratings: STARTER_CRITERIA.map((criterion) => ({ criterion, rating: 0, comment: "" })) },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "ratings" });

  function onSubmit(values: ScorecardValues) {
    submit.mutate(
      {
        interviewId,
        ratings: values.ratings.map((item) => ({ ...item, comment: item.comment || undefined })),
        recommendation: values.recommendation,
      },
      {
        onSuccess: () => {
          toast.success("Scorecard submitted");
          onDone();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      <Field label="Overall recommendation" htmlFor="recommendation" error={errors.recommendation?.message}>
        <Select id="recommendation" {...register("recommendation")}>
          <option value="recommend">Recommend</option>
          <option value="maybe">Maybe</option>
          <option value="not_recommend">Do not recommend</option>
        </Select>
      </Field>
      {fields.map((field, index) => (
        <div key={field.id} className="rounded-lg border p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Field label="Criterion" htmlFor={`criterion-${index}`} error={errors.ratings?.[index]?.criterion?.message}>
                <Input id={`criterion-${index}`} {...register(`ratings.${index}.criterion`)} />
              </Field>
            </div>
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="mt-6" aria-label="Remove criterion" onClick={() => remove(index)}>
                <Trash2 />
              </Button>
            )}
          </div>
          <Controller
            control={control}
            name={`ratings.${index}.rating`}
            render={({ field: rating }) => (
              <div className="mt-3">
                <div role="radiogroup" aria-label="Rating" className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating.value === value}
                      onClick={() => rating.onChange(value)}
                      className={cn(
                        "size-10 rounded-md border text-sm font-bold transition-colors",
                        rating.value === value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {errors.ratings?.[index]?.rating && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    Choose a rating from 1 to 5
                  </p>
                )}
              </div>
            )}
          />
          <Input className="mt-3" placeholder="Comment (optional)" aria-label="Comment" {...register(`ratings.${index}.comment`)} />
        </div>
      ))}
      {errors.ratings?.root && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {errors.ratings.root.message}
        </p>
      )}
      <Button
        type="button"
        variant="soft"
        className="self-start"
        disabled={fields.length >= 20}
        onClick={() => append({ criterion: "", rating: 0, comment: "" })}
      >
        <Plus /> Add criterion
      </Button>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? "Submitting..." : "Submit scorecard"}
        </Button>
      </div>
    </form>
  );
}
