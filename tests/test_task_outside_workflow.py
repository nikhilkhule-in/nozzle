from nozzle import task, workflow


@task
def simple_task():
    return "Task completed"


def test_simple_workflow():
    @workflow
    def simple_workflow():

        simple_task()

    assert len(simple_workflow.queue) == 1
    results = simple_workflow()
    assert results == ["Task completed"]
