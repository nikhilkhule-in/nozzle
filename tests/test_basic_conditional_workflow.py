import logging
from nozzle import task, workflow

logger = logging.getLogger(__name__)


def test_basic_conditional_workflow():
    @workflow
    def basic_conditional_workflow():
        @task
        def task_returning_something():
            logger.warning("This task returned True")
            return True

        @task
        def task_run_if_true():
            logger.warning(
                "This task ran because the previous task returned True"
            )
            return "It is True"

        @task
        def task_run_if_false():
            logger.warning(
                "This task ran because the previous task returned False"
            )
            return "It is False"

        task_run_if_true() if task_returning_something() else task_run_if_false()

    logger.warning([task.id for task in basic_conditional_workflow.queue])
    results = basic_conditional_workflow()
    assert results == [True, "It is True"]
