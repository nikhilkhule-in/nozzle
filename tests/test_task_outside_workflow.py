from nozzle import task, workflow


@task
def simple_task():
    return "Task completed"


def test_task_outside_workflow():
    @workflow
    def task_outside_workflow():
        simple_task()

    assert len(task_outside_workflow.queue) == 1
    results = task_outside_workflow()
    assert results == ["Task completed"]
