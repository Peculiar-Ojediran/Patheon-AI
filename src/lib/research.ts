import type { Hypothesis } from "./types";

export type Paper = {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  url: string;
  domain: string;
  description: string;
};

// Handwritten, unvalidated starting points. These are never returned as AI output.
export const EXAMPLE_HYPOTHESES: Hypothesis[] = [
  {
    id: "example-stark",
    title: "Mapping weak-field orbital mixing",
    summary:
      "Test whether a weak static electric field produces a measurable change in the angular density of a prepared hydrogen n = 2 state.",
    domain: "Atomic physics",
    rationale:
      "An electric field couples opposite-parity states. The nearly degenerate 2s and 2p levels require a degenerate treatment; the field-free orbital is only the starting basis.",
    methodology: [
      "Diagonalize a hydrogen n = 2 Hamiltonian including the Stark interaction and a stated fine-structure/Lamb-shift approximation.",
      "Sweep field strength and compare the predicted angular density with the zero-field baseline.",
      "Check basis convergence and report the field range where omitted states materially change the result.",
    ],
    limitations:
      "Unvalidated example proposal. The orbital viewer shows field-free densities and does not solve the Stark Hamiltonian. Preparation, finite lifetime, and detection resolution must be modeled before an experiment.",
    source: "example",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "example-tomography",
    title: "Resolving a p-orbital nodal plane",
    summary:
      "Test how finite spatial resolution and counting noise affect recovery of the nodal plane in a synthetic hydrogen 2p density.",
    domain: "Quantum imaging",
    rationale:
      "The ideal 2p_z density vanishes in the equatorial plane. Detector blur can fill this minimum, creating a useful controlled benchmark for a reconstruction method.",
    methodology: [
      "Sample an analytic 2p_z probability density with known orientation and normalization.",
      "Apply a range of Gaussian point-spread widths and Poisson counting noise with fixed random seeds.",
      "Fit the orientation on held-out samples; report angular error and uncertainty as a function of resolution and count budget.",
    ],
    limitations:
      "Unvalidated example proposal using synthetic data. Position-density reconstruction alone does not recover wavefunction phase; a real imaging setup requires its own forward model.",
    source: "example",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "example-blockade",
    title: "Testing the range of Rydberg blockade",
    summary:
      "Test whether double-excitation suppression follows the predicted separation dependence in an idealized pair of driven Rydberg atoms.",
    domain: "Quantum simulation",
    rationale:
      "In the van der Waals regime, the interaction shift scales approximately as C6 / R^6. A two-atom model can connect that shift to observable excitation probabilities.",
    methodology: [
      "Specify an atomic species, Rydberg level, Rabi frequency, and documented C6 coefficient with consistent units.",
      "Evolve a two-atom master equation over separation and compare double-excitation probability with the noninteracting baseline.",
      "Repeat with dephasing and position uncertainty; identify where the blockade contrast is distinguishable from noise.",
    ],
    limitations:
      "Unvalidated example proposal. The simple C6 model fails near resonances and ignores some angular couplings. The displayed low-n hydrogen orbitals are not Rydberg states or a blockade simulation.",
    source: "example",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
];

// Curated bibliographic records checked against publisher pages or author preprints.
// This is a local reading list, not a live literature search or citation ranking.
export const PAPERS: Paper[] = [
  {
    id: "stodolna-2013",
    title:
      "Hydrogen Atoms under Magnification: Direct Observation of the Nodal Structure of Stark States",
    authors: "A. S. Stodolna et al.",
    year: 2013,
    journal: "Physical Review Letters",
    url: "https://doi.org/10.1103/PhysRevLett.110.213001",
    domain: "Quantum imaging",
    description:
      "Photoionization microscopy reveals nodal structure in hydrogen Stark states, linking a microscopic wavefunction feature to a macroscopic measurement.",
  },
  {
    id: "barredo-2016",
    title:
      "An atom-by-atom assembler of defect-free arbitrary two-dimensional atomic arrays",
    authors: "Daniel Barredo et al.",
    year: 2016,
    journal: "Science",
    url: "https://arxiv.org/abs/1607.03042",
    domain: "Atomic physics",
    description:
      "Movable optical tweezers arrange individual atoms into specified two-dimensional patterns, providing a route to controllable quantum systems.",
  },
  {
    id: "bernien-2017",
    title: "Probing many-body dynamics on a 51-atom quantum simulator",
    authors: "Hannes Bernien et al.",
    year: 2017,
    journal: "Nature",
    url: "https://doi.org/10.1038/nature24622",
    domain: "Quantum simulation",
    description:
      "A programmable array of Rydberg atoms realizes an interacting spin model and probes ordered phases and dynamics after a quantum quench.",
  },
  {
    id: "bloch-2008",
    title: "Many-body physics with ultracold gases",
    authors: "Immanuel Bloch, Jean Dalibard & Wilhelm Zwerger",
    year: 2008,
    journal: "Reviews of Modern Physics",
    url: "https://doi.org/10.1103/RevModPhys.80.885",
    domain: "Quantum simulation",
    description:
      "A review of ultracold atomic gases as controlled settings for studying interactions, optical lattices, and many-body quantum phenomena.",
  },
];

export const PAPER_DOMAINS = [
  "All fields",
  ...new Set(PAPERS.map((paper) => paper.domain)),
];
