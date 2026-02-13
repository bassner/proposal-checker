export interface CommentTemplate {
  label: string;
  text: string;
}

export interface CommentTemplateCategory {
  category: string;
  templates: CommentTemplate[];
}

export const COMMENT_TEMPLATES: CommentTemplateCategory[] = [
  {
    category: "Content",
    templates: [
      { label: "Needs more detail", text: "Needs more detail on this point." },
      { label: "Good point", text: "Good point, keep as is." },
      { label: "Revise section", text: "Please revise this section." },
      { label: "Clarify argument", text: "The argument here is unclear. Please clarify." },
      { label: "Expand discussion", text: "Please expand the discussion here." },
    ],
  },
  {
    category: "Structure",
    templates: [
      { label: "Reorganize", text: "Consider reorganizing this section for better flow." },
      { label: "Missing transition", text: "Add a transition between these sections." },
      { label: "Move section", text: "This content would fit better in a different section." },
      { label: "Split section", text: "This section is too long. Consider splitting it." },
    ],
  },
  {
    category: "References",
    templates: [
      { label: "Add reference", text: "Add a reference for this claim." },
      { label: "Outdated reference", text: "This reference is outdated. Please find a more recent source." },
      { label: "Check citation format", text: "Please check the citation format here." },
      { label: "More sources needed", text: "More sources are needed to support this argument." },
    ],
  },
  {
    category: "Methodology",
    templates: [
      { label: "Justify approach", text: "Please justify why this approach was chosen." },
      { label: "Describe limitations", text: "Describe the limitations of this approach." },
      { label: "More detail on methodology", text: "Needs more detail on methodology." },
      { label: "Compare alternatives", text: "Consider comparing with alternative approaches." },
    ],
  },
];
