# AURA AI Product Content Workflow

An in-progress n8n automation project for organizing product photography, coordinating AI-assisted content generation, validating outputs, and routing assets through human review.

> **Project status:** Work in progress. The workflow architecture and core automation stages are being developed and refined. It is not yet intended for production use.

## Overview

The AURA workflow is designed to reduce the manual work involved in receiving product photographs, organizing assets, generating product content, reviewing AI outputs, and tracking the status of each product.

n8n acts as the orchestration layer between file intake, JavaScript processing, Google Drive, OpenAI-powered generation and validation, human review, and dashboard reporting.

## Problem

Product content production involves several connected tasks:

- Receiving raw photography through email and WeTransfer
- Identifying and organizing files for each product
- Preparing images and product information for processing
- Generating product imagery and written content
- Checking outputs against the original references
- Routing approved and rejected assets
- Tracking progress across multiple review stages

Handling these steps manually can make it difficult to maintain consistent file organization, review status, and output quality. This project explores how workflow automation and structured human approval can make that process easier to manage.

## Workflow Architecture

```mermaid
flowchart TD
    A[Email trigger] --> B[Extract WeTransfer link]
    B --> C[Retrieve and inspect project files]
    C --> D[JavaScript file processing]
    D --> E[Google Drive raw asset storage]
    E --> F[n8n workflow orchestration]

    F --> G[Scheduled AURA image generation skill]
    G --> I[Scheduled AURA image review skill]
    I --> K{AI review result}

    K -->|Approved| L[Content creator review]
    K -->|Rejected| M[Revision queue]

    L --> N{Creator decision}
    N -->|Approved| O[Designer review]
    N -->|Rejected| M

    O --> P{Designer decision}
    P -->|Approved| Q[Approved deliverables]
    P -->|Rejected| M

    F --> R[AURA operations dashboard]
    K --> R
    N --> R
    P --> R
```

## Main Workflow Stages

### 1 File Intake

The workflow begins when an email containing a WeTransfer link is received. The link is extracted and prepared for file retrieval.

### 2 File Processing and Storage

JavaScript steps inspect and organize the incoming files. Raw assets are stored in a structured Google Drive folder system so that each product can move through the workflow independently.

### 3 AI Assisted Generation

Scheduled ChatGPT skills work directly from each prepared piece in `RawFootage/Approved`. Accepted images are stored in the piece's `04_PRODUCT_IMAGE_OUTPUTS` folder. The complete piece then moves to `Content/AIApproved`; rejected candidates and failed attempts are retained under the piece's `_run` folder in `Content/AIRejected`.

### 4 Automated Validation

Generated outputs pass through validation steps before human review. These checks are intended to identify missing files, incorrect formats, incomplete outputs, or results that require another attempt.

### 5 Human Review

The workflow includes approval and rejection stages for content creators and designers. Rejected outputs return to a revision path instead of being treated as completed work.

### 6 Status Tracking

The private AURA operations dashboard summarizes every current Raw Footage and Content stage, supports search and stage filtering, and links each piece back to Google Drive.

## Technologies

- **n8n** for workflow orchestration
- **JavaScript** for link, page, and file processing
- **OpenAI tools** for AI-assisted image and content workflows
- **Google Drive** for structured asset storage
- **OpenAI Sites** for the creator, designer, and operations dashboards
- **Email and WeTransfer** for project intake

## Project Goals

- Build a clear and repeatable product-content workflow
- Reduce repetitive file handling and status updates
- Keep AI generation grounded in real product references
- Add automated checks before human review
- Preserve human approval for final creative decisions
- Make failures and rejected outputs easy to identify and retry

## Current Status

This repository documents an active prototype. Workflow stages may change as testing continues.

Current development areas include:

- Workflow orchestration and file routing
- Product folder organization
- AI generation and validation steps
- Approval and rejection states
- Retry and error-handling logic
- Dashboard status reporting
- Documentation and testing

## Importing the Workflow

1. Download or clone this repository.
2. Open your n8n instance.
3. Create a workflow and select the option to import from a file.
4. Import the json files.
5. Reconnect the required credentials in n8n.
6. Replace example folder IDs, URLs, and configuration values with values from your environment.
7. Test each stage with non-sensitive sample data before activating the workflow.

## Planned Improvements

- Complete end-to-end workflow testing
- Improve retry and failure handling
- Add clearer execution logging
- Validate duplicate and incomplete file submissions
- Expand automated quality checks
- Connect and validate the final operations dashboard webhook
- Add sanitized workflow screenshots and test examples
- Document deployment and maintenance procedures

## Author

**Karim Khalil**


