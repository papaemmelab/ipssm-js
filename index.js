import betas from './utils/betasRiskScore.js'
import { genesRes } from './utils/genes.js'
import { computeIpssm, computeIpssr } from './utils/riskRanges.js'


/**
 * Calculate the residual genes weigth contribution to the IPPS-M score with missing values.
 * @param {Array.<number, string>} patientRes
 *     one entry per residual gene with value 0/1/NA
 * @param {Array.<number, string>} nRef
 *     number of residual mutated from the reference patient (eg. average)
 * @return {number} -
 *     The"generalized" number of mutated genes from residual list
 */
const calculateNResMissing = (patientRes, nRef = 0.388) => {
  // Number of missing genes
  const M = Object.values(patientRes).filter((value) => value === 'NA').length
  // Number of sequenced genes
  const S = Object.values(patientRes).filter((value) => value !== 'NA').length
  // Sum of mutated genes within S
  const Ns = Object.values(patientRes)
    .filter((value) => value !== 'NA')
    .reduce((sum, x) => sum + Number(x), 0)

  // Worst scenario: all missing are mutated
  const nResWorst = Math.min(Ns + M, 2)
  // Best scenario: none missing are mutated
  const nResBest = Math.min(Ns, 2)
  // Average scenario: generalized min(Nres,2)
  const nResMean =
    Math.min(Ns, 2) + Math.max(((2 - Ns) / 2) * (M / (S + M)) * nRef, 0)

  // formula for generalized min(Nres,2)
  return { nResMean, nResWorst, nResBest }
}

/**
 * Process inputs from user-based variable to model-based variables.
 * @param {Object} patientInput = user-input variables
 * @param {Object} genesMain = gene/variable names with attributed weights in risk score
 * @param {Object} genesRes = gene/variable names in the "residual list" to construct a combined feature (called Nres2)
 * @param {Object} betas = risk model variables/weights/scaling
 *
 * @returns {Object} model-based variables
 */
const processInputs = (patientInput) => {
  const processed = { ...patientInput }

  // Construction of SF3B1 features i.e SF3B1_5q
  processed.SF3B1_5q =
    processed.SF3B1 !== 'NA'
      ? Number(processed.SF3B1) === 1 &&
        Number(processed.del5q) === 1 &&
        Number(processed.del7_7q) === 0 &&
        Number(processed.complex) === 0
        ? 1
        : 0
      : Number(processed.del5q) === 0
      ? 0
      : 'NA'

  processed.SF3B1_alpha =
    processed.SF3B1 !== 'NA' &&
    processed.SF3B1_5q !== 'NA' &&
    processed.SRSF2 !== 'NA' &&
    processed.STAG2 !== 'NA' &&
    processed.BCOR !== 'NA' &&
    processed.BCORL1 !== 'NA' &&
    processed.RUNX1 !== 'NA' &&
    processed.NRAS !== 'NA'
      ? Number(processed.SF3B1) === 1 &&
        Number(processed.SF3B1_5q) === 0 &&
        Number(processed.SRSF2) === 0 &&
        Number(processed.STAG2) === 0 &&
        Number(processed.BCOR) === 0 &&
        Number(processed.BCORL1) === 0 &&
        Number(processed.RUNX1) === 0 &&
        Number(processed.NRAS) === 0
        ? 1
        : 0
      : Number(processed.SRSF2) === 1 ||
        Number(processed.STAG2) === 1 ||
        Number(processed.BCOR) === 1 ||
        Number(processed.BCORL1) === 1 ||
        Number(processed.RUNX1) === 1 ||
        Number(processed.NRAS) === 1
      ? 0
      : 'NA'

  // Construction of TP53multi feature
  processed.TP53loh =
    Number(processed.TP53maxvaf) / 100 > 0.55 ||
    Number(processed.del17_17p) === 1
      ? '1'
      : processed.TP53loh

  processed.TP53mut = String(processed.TP53mut)
  processed.TP53loh = String(processed.TP53loh)

  processed.TP53multi =
    processed.TP53mut === '0'
      ? 0
      : processed.TP53mut === '2 or more'
      ? 1
      : (processed.TP53mut === '1') & (processed.TP53loh === '1')
      ? 1
      : (processed.TP53mut === '1') & (processed.TP53loh === '0')
      ? 0
      : 'NA'

  // Transformation of clinical variables
  processed.HB1 = Number(processed.HB)
  processed.BLAST5 = Math.min(Number(processed.BM_BLAST), 20) / 5
  processed.TRANSF_PLT100 = Math.min(Number(processed.PLT), 250) / 100 // ceiling at 250

  // Cytogenetics as a numerical vector
  processed.CYTOVEC = {
    'Very Good': 0,
    Good: 1,
    Intermediate: 2,
    Poor: 3,
    'Very Poor': 4,
  }[processed.CYTO_IPSSR]

  // Calculation of number of residual mutations Nres2
  // with generalization to allow some missing genes in the list of residual genes
  const processedResGenes = Object.fromEntries(
    Object.entries(processed).filter(([key, _]) => genesRes.includes(key))
  )
  const nRes2Means = betas.find((i) => i.name === 'Nres2').means
  const { nResMean, nResWorst, nResBest } = calculateNResMissing(
    processedResGenes,
    nRes2Means
  )

  processed.Nres2 = {
    means: nResMean,
    worst: nResWorst,
    best: nResBest,
  }

  return processed
}

const ipssm = (patientInput) => {
  const processed = processInputs(patientInput)
  return computeIpssm(processed)
  // const {means, best, worst} = computeIpssm(processed)
  // const bestRiskScore = best.riskScore
  // const worstRiskScore = worst.riskScore
  // const meansRiskScore = means.riskScore
  // if (bestRiskScore === worstRiskScore === meansRiskScore) {
  //   return {
  //     riskScore: means.riskScore,
  //     riskCategory: means.riskCat,
  //   }
  // } else {
  //   return {
  //     riskScore: means.riskScore,
  //     riskCategory: means.riskCat,
  //     bestRiskScore: best.riskScore,
  //     bestRiskCategory: best.riskCat,
  //     worstRiskScore: worst.riskScore,
  //     worstRiskCategory: worst.riskCat,
  //   }
  // }
  
}

const ipssr = computeIpssr

export { ipssm, ipssr }