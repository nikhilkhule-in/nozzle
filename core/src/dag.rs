//! DAG types and validation: workflow/task specs, dependency edges with
//! declarative branch predicates.

use serde::{Deserialize, Serialize};

/// Comparison operator for a branch predicate. MVP supports equality over
/// JSON scalar values only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PredicateOp {
    Equals,
    NotEquals,
}

/// Declarative gate on a dependency edge, evaluated against the upstream
/// task's materialized output once it succeeds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Predicate {
    pub op: PredicateOp,
    /// Expected value; must be a JSON scalar (string, number, or boolean).
    pub value: serde_json::Value,
}

/// A unit of work within a workflow. Tasks inherit the workflow's language;
/// `runtime` names the worker pool kind (e.g. `local-process`, `cf-container`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskSpec {
    pub name: String,
    pub runtime: String,
}

/// Dependency edge: `downstream` needs `upstream`'s output bound to argument
/// `arg`. An optional [`Predicate`] turns the edge into a branch gate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Edge {
    pub upstream: String,
    pub downstream: String,
    pub arg: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub predicate: Option<Predicate>,
}

/// Static workflow definition. The orchestrator stores this per workflow;
/// runs additionally pin a bundle version carrying the executable code.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkflowSpec {
    pub id: String,
    pub language: String,
    pub tasks: Vec<TaskSpec>,
    pub edges: Vec<Edge>,
}

fn is_scalar(v: &serde_json::Value) -> bool {
    v.is_string() || v.is_number() || v.is_boolean()
}

/// Evaluate a predicate against an upstream task's materialized output.
/// Type-strict: `1` never equals `"1"`.
pub fn evaluate_predicate(output: &serde_json::Value, pred: &Predicate) -> bool {
    let eq = output == &pred.value;
    match pred.op {
        PredicateOp::Equals => eq,
        PredicateOp::NotEquals => !eq,
    }
}

/// Validate a workflow definition, returning every problem found.
pub fn validate(spec: &WorkflowSpec) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    if spec.id.is_empty() {
        errors.push("workflow id must not be empty".to_string());
    }
    if spec.language.is_empty() {
        errors.push("workflow language must not be empty".to_string());
    }
    let mut seen = std::collections::HashSet::new();
    for t in &spec.tasks {
        if t.name.is_empty() {
            errors.push("task name must not be empty".to_string());
        } else if !seen.insert(t.name.as_str()) {
            errors.push(format!("duplicate task name: {}", t.name));
        }
    }
    for e in &spec.edges {
        if !seen.contains(e.upstream.as_str()) {
            errors.push(format!("edge references unknown upstream: {}", e.upstream));
        }
        if !seen.contains(e.downstream.as_str()) {
            errors.push(format!("edge references unknown downstream: {}", e.downstream));
        }
        if e.upstream == e.downstream {
            errors.push(format!("self-edge on task: {}", e.upstream));
        }
        if e.arg.is_empty() {
            errors.push(format!("edge {} -> {} needs an arg name", e.upstream, e.downstream));
        }
        if let Some(p) = &e.predicate {
            if !is_scalar(&p.value) {
                errors.push(format!(
                    "predicate on edge {} -> {} must be a JSON scalar",
                    e.upstream, e.downstream
                ));
            }
        }
    }
    if has_cycle(spec) {
        errors.push("workflow graph contains a cycle".to_string());
    }
    if errors.is_empty() { Ok(()) } else { Err(errors) }
}

fn has_cycle(spec: &WorkflowSpec) -> bool {
    // Kahn's algorithm over known tasks only.
    let mut indegree: std::collections::HashMap<&str, usize> = spec
        .tasks
        .iter()
        .map(|t| (t.name.as_str(), 0))
        .collect();
    for e in &spec.edges {
        if let Some(d) = indegree.get_mut(e.downstream.as_str()) {
            *d += 1;
        }
    }
    let mut queue: Vec<&str> = indegree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(&n, _)| n)
        .collect();
    let mut visited = 0;
    while let Some(n) = queue.pop() {
        visited += 1;
        for e in spec.edges.iter().filter(|e| e.upstream == n) {
            if let Some(d) = indegree.get_mut(e.downstream.as_str()) {
                *d -= 1;
                if *d == 0 {
                    queue.push(e.downstream.as_str());
                }
            }
        }
    }
    visited != spec.tasks.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn linear() -> WorkflowSpec {
        WorkflowSpec {
            id: "w".into(),
            language: "python".into(),
            tasks: vec![
                TaskSpec { name: "a".into(), runtime: "local-process".into() },
                TaskSpec { name: "b".into(), runtime: "local-process".into() },
            ],
            edges: vec![Edge {
                upstream: "a".into(),
                downstream: "b".into(),
                arg: "x".into(),
                predicate: None,
            }],
        }
    }

    #[test]
    fn valid_linear_spec_passes() {
        assert!(validate(&linear()).is_ok());
    }

    #[test]
    fn duplicate_names_rejected() {
        let mut s = linear();
        s.tasks.push(TaskSpec { name: "a".into(), runtime: "x".into() });
        assert!(validate(&s).unwrap_err().iter().any(|e| e.contains("duplicate")));
    }

    #[test]
    fn unknown_edge_endpoint_rejected() {
        let mut s = linear();
        s.edges.push(Edge {
            upstream: "ghost".into(),
            downstream: "b".into(),
            arg: "x".into(),
            predicate: None,
        });
        assert!(validate(&s).unwrap_err().iter().any(|e| e.contains("unknown upstream")));
    }

    #[test]
    fn cycle_rejected() {
        let mut s = linear();
        s.edges.push(Edge {
            upstream: "b".into(),
            downstream: "a".into(),
            arg: "x".into(),
            predicate: None,
        });
        assert!(validate(&s).unwrap_err().iter().any(|e| e.contains("cycle")));
    }

    #[test]
    fn non_scalar_predicate_rejected() {
        let mut s = linear();
        s.edges[0].predicate = Some(Predicate {
            op: PredicateOp::Equals,
            value: json!({"nested": true}),
        });
        assert!(validate(&s).unwrap_err().iter().any(|e| e.contains("scalar")));
    }

    #[test]
    fn predicate_eval_is_type_strict() {
        let eq = Predicate { op: PredicateOp::Equals, value: json!(true) };
        assert!(evaluate_predicate(&json!(true), &eq));
        assert!(!evaluate_predicate(&json!(1), &Predicate {
            op: PredicateOp::Equals,
            value: json!("1"),
        }));
        assert!(evaluate_predicate(&json!(1), &Predicate {
            op: PredicateOp::NotEquals,
            value: json!(2),
        }));
        assert!(!evaluate_predicate(&json!(2), &Predicate {
            op: PredicateOp::NotEquals,
            value: json!(2),
        }));
    }
}
